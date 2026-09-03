# Cifro — análise de categorias e mensagens de validação

Data da análise: 02/09/2026  
Repositório analisado: `/home/jeanlc77/Documents/ChatGPT/Cifro`  
Estado analisado: commit `0568bf0` — `test: adiciona cobertura das regras financeiras`

Este documento analisa dois problemas observados depois da execução das melhorias:

1. o novo comportamento relacionado às categorias;
2. a mensagem `[object Object]` ao tentar registrar uma descrição muito grande.

Este README concentra o planejamento e o registro das etapas executadas. A etapa de estudo de RLS, grants e Data API continua fora do escopo desta execução.

## Resumo executivo

A execução não foi apenas um remendo visual. Ela implementou correções reais para categorias:

- validação de propriedade pelo usuário;
- validação de categoria ativa;
- compatibilidade entre tipo da categoria e direção da movimentação;
- compatibilidade entre compromisso e direção da transação;
- arquivamento de categorias em vez de exclusão física;
- preservação de categorias arquivadas em snapshots de orçamento;
- testes de isolamento por usuário.

Mesmo assim, a solução ainda não cobre todo o ciclo de vida da categoria. Permanecem duas decisões importantes:

- impedir que o tipo de uma categoria já usada seja alterado e deixe o histórico semanticamente incoerente;
- tornar obrigatória a coerência completa entre compromisso e categoria, inclusive quando um dos valores é nulo.

O segundo problema, `[object Object]`, é um bug confirmado no frontend. O limite de 160 caracteres do backend está funcionando, mas a resposta de erro não é convertida em uma mensagem legível.

## Evidências verificadas

- Os testes locais anteriores foram executados: 20 testes passaram.
- O build atual do frontend passou com sucesso.
- `TransactionCreate.description` possui `max_length=160` em `apps/backend/app/schemas.py`.
- O backend retorna uma validação estruturada do Pydantic quando a descrição ultrapassa esse limite.
- `apiRequest` em `apps/frontend/app/page.js` normaliza listas, objetos e falhas de rede antes de exibir mensagens.
- Os campos de descrição da confirmação, edição e entrada rápida possuem `maxLength={160}` e contador visual.
- O endpoint de categoria agora arquiva com `is_active = false`.
- A validação de categoria é usada em criação de compromisso, edição de compromisso, criação de transação e edição de transação quando a relação é alterada.
- Os testes atuais não cobrem todas as combinações de direção, categoria, compromisso e alteração do tipo de uma categoria usada.

## 1. Análise do comportamento das categorias

### O que foi corrigido corretamente

O helper `validate_category_for_direction` agora verifica:

- `category_id` pertencente ao `user_id` autenticado;
- categoria existente;
- categoria ativa;
- `category.kind` igual à direção usada ou igual a `both`.

Essa validação é chamada em:

- `create_commitment`;
- `update_commitment`;
- `create_transaction`;
- `update_transaction`, quando a categoria ou a direção muda.

O helper `validate_commitment_for_transaction` também verifica:

- compromisso pertencente ao usuário;
- compromisso ativo;
- mesma direção da transação;
- incompatibilidade explícita entre duas categorias diferentes.

Portanto, se o problema original era simplesmente criar uma movimentação de gasto usando uma categoria somente de recebimento, a execução corrigiu corretamente esse caso. Não é apenas um bug de interface.

### O arquivamento também foi implementado de forma coerente

O endpoint `DELETE /categories/{category_id}` deixou de apagar a linha e passou a atualizar `is_active = false`.

A migration `20260901015408_archive_categories.sql` também:

- troca a unicidade global pelo nome por uma unicidade apenas entre categorias ativas;
- permite arquivar uma categoria usada por snapshots antigos;
- mantém a proteção contra mudança de tipo quando a categoria é usada na base ou na distribuição do orçamento.

Além disso, a consulta do resumo do orçamento deixou de filtrar somente categorias ativas. Isso evita esconder alocações históricas de uma categoria arquivada.

Essa parte da execução está conceitualmente correta: arquivar deve impedir novos usos sem apagar o significado dos registros antigos.

## 2. Brechas que ainda existem nas categorias

### CIFRO-031 — O tipo da categoria pode ser alterado depois de já ser usado

**Status: implementado na API e na migration de integridade.**

Antes da etapa de execução, `update_category` permitia alterar `name` e `kind` de uma categoria ativa. A proteção antiga verificava somente parte do orçamento.

Exemplo:

1. criar a categoria `Mercado` como `expense`;
2. registrar várias despesas usando `Mercado`;
3. editar a categoria para `income`;
4. as despesas antigas continuam apontando para uma categoria que agora representa recebimento.

O banco não considera isso uma violação de chave estrangeira, mas o significado dos dados ficou incoerente. A categoria também pode deixar de aparecer como opção para novos gastos, enquanto continua aparecendo nos registros antigos.

**Implementação:** permitir renomear e arquivar uma categoria usada, mas bloquear a mudança de `kind` depois que houver qualquer uso em:

- `transactions`;
- `commitments`;
- `budget_settings`;
- `budget_allocations`;
- `budget_months`;
- `budget_month_allocations`.

Se o usuário quiser mudar a natureza, deve arquivar a categoria antiga e criar uma nova.

**Por quê:** o tipo da categoria é parte da semântica dos registros. Alterá-lo retroativamente muda a interpretação do histórico.

### CIFRO-032 — Compromisso e categoria podem ficar parcialmente incoerentes

**Status: implementado na API e na migration de integridade.**

Antes da etapa de execução, a validação rejeitava duas categorias diferentes somente quando ambas estavam preenchidas:

```python
if category_id and commitment["category_id"] and category_id != commitment["category_id"]:
```

Assim, ainda são aceitos casos como:

- compromisso com categoria `Alimentação` e transação com `category_id = null`;
- compromisso sem categoria e transação com uma categoria qualquer.

Isso pode ser válido como decisão de produto, mas atualmente não está declarado. O sistema aparenta tratar o compromisso como origem da transação, e as transações geradas pelo compromisso usam a categoria do próprio compromisso.

**Implementação:** adotar a regra abaixo:

- se o compromisso possui categoria, a transação vinculada deve usar exatamente a mesma categoria;
- se o compromisso não possui categoria, a transação vinculada também deve ficar sem categoria;
- uma exceção para sobrescrever categoria deve ser uma funcionalidade explícita, com um campo ou ação própria, não um comportamento implícito.

**Por quê:** uma ligação parcial dificulta saber se a categoria da transação representa o compromisso ou uma classificação manual posterior.

### CIFRO-033 — Categoria arquivada não possui restauração

**Status: lacuna de ciclo de vida. Prioridade média.**

Depois do arquivamento, `list_categories` retorna somente categorias ativas e `update_category` só edita categorias ativas. Não existe endpoint nem tela para restaurar uma categoria.

Isso não é necessariamente um bug: pode ser uma decisão de produto. Porém, se o arquivamento for reversível, falta uma operação explícita de restauração.

**Recomendação:** decidir entre:

- arquivamento definitivo, com criação de uma nova categoria quando necessário; ou
- arquivamento reversível, com listagem administrativa e endpoint de restauração.

Não reativar automaticamente uma categoria só porque o usuário tenta criar outra com o mesmo nome.

## 3. Matriz de comportamento recomendada

| Situação | Deve permitir? | Regra recomendada |
|---|---:|---|
| Nova transação com categoria ativa compatível | Sim | Categoria pertence ao usuário e aceita a direção |
| Nova transação com categoria inativa | Não | Categoria arquivada não serve para novos registros |
| Nova transação com categoria incompatível | Não | Retornar erro legível |
| Compromisso com categoria incompatível | Não | Validar direção no backend |
| Transação e compromisso com categorias diferentes | Não | A categoria do compromisso deve prevalecer |
| Transação vinculada a compromisso categorizado sem categoria | Não | Evitar relação parcial |
| Alterar nome de categoria usada | Sim | Nome não muda a semântica histórica |
| Alterar tipo de categoria usada | Não | Arquivar a antiga e criar outra |
| Arquivar categoria usada | Sim | Preservar histórico e impedir novos usos |
| Restaurar categoria arquivada | Decisão | Só se existir fluxo explícito |

## 4. Análise da descrição muito grande

### O backend fez a validação correta

O schema define:

```python
description: str = Field(min_length=1, max_length=160)
```

Ao receber uma descrição com 161 ou mais caracteres, o Pydantic retorna `422 Unprocessable Entity` com uma estrutura semelhante a:

```json
{
  "detail": [
    {
      "type": "string_too_long",
      "loc": ["description"],
      "msg": "String should have at most 160 characters",
      "ctx": {"max_length": 160}
    }
  ]
}
```

Isso significa que o registro não foi salvo. O limite financeiro/documental está funcionando.

### O frontend é que apresenta o erro incorretamente

Em `apiRequest`, o código faz essencialmente:

```javascript
throw new Error(body.detail || "Não foi possível falar com a API.");
```

Quando `body.detail` é uma lista contendo objetos, o construtor de `Error` converte essa estrutura para texto usando a representação padrão de JavaScript. O resultado visível é:

```text
[object Object]
```

Esse resultado não informa ao usuário o que aconteceu e também não é evidência de falha de banco ou de categoria. É um bug de tradução da resposta de erro.

## 5. Melhoria recomendada para a mensagem

### Comportamento esperado

Ao exceder o limite, o usuário deve ver algo como:

> A descrição pode ter no máximo 160 caracteres. Reduza o texto antes de confirmar o registro.

O sistema não deve truncar silenciosamente a descrição, porque isso altera o histórico financeiro sem o usuário perceber.

### Correção em duas camadas

#### Camada visual

Adicionar ao campo de descrição da confirmação:

- `maxLength={160}`;
- contador de caracteres, por exemplo `132/160`;
- indicação visual quando o limite estiver próximo;
- mensagem associada ao campo, e não apenas um aviso genérico no final da tela.

Também é recomendável limitar ou orientar o campo de entrada rápida, já que o texto digitado nele é usado como descrição.

#### Camada de transporte

Criar uma função única para converter erros da API em mensagens:

- string: exibir a própria string;
- lista de detalhes: extrair `msg` e juntar as mensagens;
- objeto: procurar `message`, `detail` ou um código conhecido;
- formato desconhecido: usar uma mensagem genérica segura.

Essa função deve ser usada por `apiRequest`, exportação e prévia de importação. Assim, erros de categoria e de validação terão o mesmo padrão de apresentação.

### Melhoria futura do contrato da API

Quando o projeto amadurecer, respostas de erro devem possuir códigos estáveis, por exemplo:

```json
{
  "code": "DESCRIPTION_TOO_LONG",
  "message": "A descrição pode ter no máximo 160 caracteres.",
  "field": "description"
}
```

O frontend não deve depender de mensagens em inglês do Pydantic nem de textos internos do banco.

## 6. Caso relacionado: descrição só com espaços

Existe uma situação próxima que deve ser coberta: o schema aceita uma string com caracteres, mas o endpoint aplica `.strip()` antes de gravar. Uma descrição formada apenas por espaços pode passar pela validação Pydantic e chegar vazia ao `CHECK` do banco.

**Recomendação:** validar texto já normalizado, rejeitando descrição vazia ou composta apenas por espaços antes da operação SQL.

**Mensagem esperada:**

> Informe uma descrição com pelo menos um caractere válido.

## 7. Testes que ainda faltam

Os 15 testes atuais passam, mas ainda devem ser acrescentados testes para:

### Categorias

- categoria `expense` aceita transação de gasto;
- categoria `income` rejeita transação de gasto;
- categoria `both` aceita as duas direções;
- categoria inativa rejeita novo vínculo;
- compromisso com direção incompatível é rejeitado;
- compromisso categorizado exige a mesma categoria na transação;
- mudança de `kind` de categoria usada é rejeitada;
- arquivamento preserva transações e snapshots;
- usuário A não consegue usar categoria ou compromisso do usuário B.

### Mensagens de validação

- descrição com 160 caracteres é aceita;
- descrição com 161 caracteres é rejeitada;
- erro 422 aparece em português e sem `[object Object]`;
- erro de categoria aparece como orientação compreensível;
- descrição composta somente por espaços é rejeitada.

## 8. Ordem recomendada para execução futura

Quando a análise de segurança terminar, a execução pode ser planejada nesta ordem:

1. verificar e fechar a fronteira de acesso direto à Data API;
2. corrigir o normalizador de erros do frontend;
3. adicionar limite visual e contador de caracteres;
4. definir e implementar a imutabilidade do tipo de categoria usada;
5. fechar a regra de categoria nula em transações vinculadas a compromissos;
6. melhorar a validação de textos normalizados;
7. adicionar os testes correspondentes;
8. validar o fluxo real no ambiente de testes.

Essa ordem começa pela correção de experiência sem alterar dados e só depois mexe nas regras de integridade.

## 9. Detalhamento das etapas de execução

As etapas abaixo transformam a ordem recomendada em um plano executável. Cada etapa possui escopo próprio e deve ser validada antes da seguinte. A existência deste detalhamento não significa que todas as etapas estejam autorizadas para execução.

### Etapa 1 — Fechar a fronteira de acesso direto ao Supabase

**Status nesta execução: ignorada a pedido do usuário.** Permanece reservada para estudo e validação de segurança.

**Objetivo:** descobrir se `anon` ou `authenticated` conseguem acessar diretamente as tabelas financeiras pela Data API e escolher uma única fronteira de negócio.

**Por que vem primeiro:** não adianta centralizar regras no FastAPI se um cliente autenticado ainda puder gravar diretamente no Supabase e contornar essas regras. RLS limita as linhas por usuário, mas não implementa, sozinho, compatibilidade entre categoria, compromisso e direção.

**Verificações necessárias:**

- conferir a exposição do schema `public` na configuração do Supabase;
- consultar os grants efetivos de `anon` e `authenticated` para `categories`, `commitments` e `transactions`;
- confirmar se o backend usa uma conexão privilegiada e, nesse caso, manter filtros explícitos por `user_id`;
- testar com um usuário de testes a leitura, criação, edição e exclusão direta pela Data API;
- verificar se uma operação direta consegue alterar o tipo de uma categoria ou apagar fisicamente uma categoria;
- confirmar que nenhuma chave `service_role` ou senha do banco chega ao frontend.

**Decisão esperada:**

1. **FastAPI como única entrada de negócio:** revogar o acesso de escrita direto às tabelas financeiras e manter as invariantes no backend, com RLS como defesa adicional; ou
2. **Data API também como entrada:** implementar as invariantes críticas no banco, por meio de constraints, triggers ou funções RPC cuidadosamente protegidas.

Para o Cifro atual, a primeira opção é a mais simples de manter, porque o frontend já usa o FastAPI para as operações de negócio.

**Arquivos e ambiente envolvidos:** `supabase/config.toml`, migrations financeiras, `apps/backend/app/db.py`, `apps/backend/app/security.py`, variáveis de ambiente e configuração efetiva do projeto remoto.

**Migration:** nenhuma migration deve ser criada apenas para investigar. Se a decisão for revogar grants, a migration será criada somente depois da confirmação, usando o comando oficial de criação de migration, e deverá conter apenas a alteração de privilégio necessária.

**Testes de aceite:**

- usuário autenticado consegue operar pelo FastAPI;
- usuário autenticado não consegue contornar as regras pela Data API, caso o FastAPI seja a fronteira escolhida;
- usuário A não consegue ler nem alterar dados do usuário B;
- a chave pública continua sendo a única credencial presente no frontend;
- a decisão e os grants verificados ficam registrados com evidência do ambiente.

**Rollback:** se a revogação bloquear uma operação legítima, restaurar temporariamente apenas o grant necessário usando uma alteração controlada e reaplicar a restrição após corrigir a dependência. Não restaurar acesso amplo sem registrar o risco aceito.

**Dependência:** nenhuma etapa funcional deve ser considerada concluída antes desta fronteira ser definida. Se a Data API continuar aceitando escrita, as etapas seguintes precisarão incluir defesa equivalente no banco.

### Etapa 2 — Corrigir o normalizador de erros do frontend

**Status: implementada.**

**Objetivo:** transformar qualquer resposta de erro da API em uma mensagem legível e consistente, eliminando `[object Object]`.

**Regra:** o frontend nunca deve exibir diretamente `body.detail` sem verificar seu tipo.

**Comportamento do normalizador:**

- texto simples: exibir o próprio texto;
- lista de erros Pydantic: extrair cada campo `msg` e juntar as mensagens;
- objeto com `message` ou `detail`: extrair o texto conhecido;
- erro de rede ou resposta sem formato: exibir mensagem genérica e recuperável;
- nunca exibir stack trace, SQL, senha, token ou conteúdo bruto da resposta.

**Arquivos envolvidos:** `apps/frontend/app/page.js`, na função `apiRequest`, e componentes que exibem `notice` ou erros de importação. Um helper em `apps/frontend/lib/` só deve ser criado se a lógica for realmente compartilhada.

**Migration:** não há alteração de banco.

**Testes de aceite:** respostas 422 com lista de objetos, 400 com string, 409 de categoria/compromisso e falhas de rede devem gerar mensagens compreensíveis, sem `[object Object]` e sem deixar a tela presa em carregamento.

**Rollback:** restaurar apenas o comportamento do transporte caso surja incompatibilidade visual. A correção não altera dados.

**Dependência:** a etapa 1 deve definir se o formato de erro do FastAPI será o contrato oficial do frontend.

### Etapa 3 — Adicionar limite visual e contador de caracteres

**Status: implementada.**

**Objetivo:** impedir que o usuário descubra o limite de 160 caracteres somente depois de enviar o formulário.

**Escopo visual:** campo de entrada rápida, descrição exibida na confirmação do registro e campo de descrição da edição de movimentação.

**Comportamento:**

- aplicar `maxLength={160}` nos campos;
- exibir contador, como `132/160`;
- destacar visualmente os últimos caracteres disponíveis;
- mostrar mensagem junto ao campo quando o limite for atingido;
- preservar a validação do backend para clientes que não usam a interface;
- não truncar silenciosamente o texto.

**Arquivos envolvidos:** `apps/frontend/app/page.js` e `apps/frontend/app/globals.css`, além de componentes de formulário caso sejam extraídos antes desta etapa.

**Migration:** não há alteração de banco.

**Testes de aceite:** 160 caracteres podem ser enviados, o 161º não é aceito pelo campo, o contador acompanha colagem e remoção, a edição respeita o limite e uma chamada direta continua recebendo 422.

**Rollback:** remover contador e limite visual sem tocar na validação do backend. O limite do schema deve permanecer ativo.

**Dependência:** etapa 2, para que chamadas fora da interface também exibam erro legível.

### Etapa 4 — Impedir alteração semântica do tipo de categoria usada

**Status: implementada na API e no banco.**

**Objetivo:** permitir renomear categorias, mas impedir que uma categoria já utilizada como gasto passe a representar recebimento, ou vice-versa.

**Regra recomendada:** se existir qualquer referência em `transactions`, `commitments`, `budget_settings`, `budget_allocations`, `budget_months` ou `budget_month_allocations`, o campo `kind` não pode ser alterado. A categoria pode ser arquivada e uma nova categoria pode ser criada com outra natureza.

**Por que a regra é ampla:** limitar o bloqueio somente a registros ativos protegeria o presente, mas permitiria reinterpretar o histórico. O tipo faz parte do significado do registro.

**Implementação planejada:**

- validar a mudança no módulo de categorias/admissão do backend;
- adicionar defesa no banco se a Data API permanecer acessível;
- retornar `409 Conflict` com código e mensagem estáveis;
- manter renomeação e arquivamento permitidos;
- orientar o usuário a arquivar a antiga e criar outra categoria.

**Arquivos envolvidos:** módulo de domínio, `apps/backend/app/main.py`, `apps/backend/app/schemas.py` se o erro for tipado, `apps/frontend/app/page.js`, `globals.css`, migration gerada pelo Supabase CLI e testes.

**Migration:** provavelmente necessária para a defesa estrutural, por meio de trigger ou outra restrição. Deve ser gerada somente após definir os grants da etapa 1 e verificar o modelo histórico.

**Testes de aceite:** categoria sem uso pode mudar de tipo; categoria usada pode mudar de nome, mas não de tipo; arquivamento preserva o histórico; uma categoria nova pode substituir a antiga; a mesma regra vale para chamadas diretas ao backend.

**Rollback:** antes de liberar novamente a alteração de `kind`, listar categorias afetadas e verificar se já existem registros semanticamente conflitantes. Não desfazer a proteção sem essa auditoria.

**Dependência:** etapa 1 e definição do módulo central de admissão. A etapa 7 deverá cobrir a matriz completa.

### Etapa 5 — Fechar a regra de categoria nula em transações vinculadas

**Status: implementada na API e no banco.**

**Objetivo:** eliminar relações parcialmente definidas entre compromisso, categoria e transação.

**Regra recomendada:**

- compromisso com categoria exige transação vinculada com a mesma categoria;
- compromisso sem categoria exige transação vinculada sem categoria;
- não permitir que uma transação vinculada substitua silenciosamente a categoria do compromisso;
- uma exceção só deve existir por meio de uma funcionalidade explícita de sobrescrita, ainda não prevista.

**Caminhos que precisam usar a mesma regra:** `create_transaction`, `update_transaction`, `record_commitment`, `process_due_commitments` e futura persistência da importação.

**Arquivos envolvidos:** módulo de admissão de transações, `apps/backend/app/main.py` enquanto as rotas não forem separadas, `apps/backend/app/schemas.py` se a relação precisar ser expressa no contrato, `apps/frontend/app/page.js` e migration/trigger caso a Data API permaneça acessível.

**Migration:** não necessariamente necessária se o FastAPI for a única entrada. Se houver escrita direta autorizada, a regra deve ter defesa no banco ou RPC.

**Testes de aceite:** compromisso categorizado gera transação na mesma categoria; categoria nula ou diferente é rejeitada; compromisso sem categoria não aceita transação vinculada com categoria; o processamento automático segue a mesma regra sem duplicar ocorrências; referências históricas não são apagadas.

**Rollback:** reverter a validação da nova escrita, sem alterar registros existentes. Antes de relaxar a regra, identificar relações parciais já armazenadas.

**Dependência:** etapa 4, porque o tipo da categoria precisa permanecer semanticamente estável.

### Etapa 6 — Normalizar e limitar textos antes do SQL

**Status: implementada.**

**Objetivo:** validar o conteúdo normalizado antes de persistir e limitar campos que hoje podem crescer sem controle.

**Regras a fechar:**

- remover espaços nas extremidades da descrição antes de validar `min_length`;
- rejeitar descrição vazia ou composta somente por espaços;
- manter o limite de 160 caracteres para descrição;
- definir um limite de `notes` antes de implementá-lo, considerando o uso real no produto;
- aplicar o mesmo tratamento em criação, edição e futuras importações;
- preservar textos existentes, validando apenas novas gravações e alterações.

**Arquivos envolvidos:** `apps/backend/app/schemas.py`, módulo de normalização/admissão, `apps/backend/app/main.py`, `apps/frontend/app/page.js` e migration opcional para reforçar limites no banco.

**Migration:** só será necessária para transformar o limite em defesa estrutural. O tamanho de `notes` deve ser decidido antes; não deve ser inventado durante a implementação.

**Testes de aceite:** texto com espaços externos é salvo normalizado; texto somente com espaços é rejeitado; descrição com 160 caracteres é aceita; descrição com 161 é rejeitada; notas dentro do limite são aceitas e acima do limite são rejeitadas sem expor detalhes internos.

**Rollback:** manter a normalização de descrição se ela apenas corrige entrada vazia; remover uma nova restrição de `notes` somente após verificar que não há clientes legítimos dependendo de textos maiores.

**Dependência:** etapa 2 para apresentar os erros corretamente e etapa 3 para alinhar a experiência da tela.

### Etapa 7 — Completar a suíte de testes

**Status nesta execução: adiada a pedido do usuário.** Os testes correspondentes serão feitos em uma etapa posterior.

**Objetivo:** transformar as decisões anteriores em proteção executável contra regressões.

**Cobertura mínima:**

- categoria `expense` com gasto;
- categoria `income` rejeitando gasto;
- categoria `both` nas duas direções;
- categoria inativa em nova relação;
- compromisso com direção incompatível;
- categoria nula e categoria divergente em compromisso vinculado;
- alteração de `kind` em categoria usada;
- arquivamento preservando histórico;
- isolamento entre usuários;
- descrições nos limites 160/161;
- texto somente com espaços;
- normalização de erros de string, lista, objeto e rede;
- criação automática duplicada e parcelas encerradas.

**Estrutura preferida:**

- testes puros para regras sem banco;
- testes de adapters com conexão simulada;
- testes de API com dependências substituídas, quando isso representar o contrato HTTP;
- testes de integração com banco de teste somente quando a migration e o ambiente estiverem disponíveis.

O projeto atualmente usa `unittest` e possui 15 testes locais. A expansão deve preservar o comando executável sem introduzir uma dependência nova sem necessidade.

**Arquivos envolvidos:** `apps/backend/tests/test_domain.py`, `apps/backend/tests/test_imports_and_isolation.py`, novos arquivos de teste quando melhorarem a leitura e configuração de CI caso o workflow ainda não execute a suíte.

**Migration:** nenhuma para testes puros. Testes de banco devem usar migration aprovada e nunca alterar o banco remoto silenciosamente.

**Testes de aceite:** o comando passa em checkout limpo; cada regra possui caso permitido e rejeitado quando aplicável; falhas informam o contexto; o build do frontend continua passando; os testes não dependem da conta pessoal nem de dados reais.

**Rollback:** remover somente testes incorretos ou excessivamente acoplados, preservando testes que documentam invariantes confirmadas.

**Dependência:** etapas 2 a 6 definidas e implementadas no escopo correspondente.

### Etapa 8 — Validar o fluxo real em ambiente de testes

**Status nesta execução: adiada a pedido do usuário.** A validação publicada será feita depois que os testes planejados forem executados.

**Objetivo:** confirmar que código, migrations, autenticação, Data API, backend, frontend e deploy funcionam juntos.

**Preparação:**

- usar um usuário de testes separado da conta pessoal;
- aplicar migrations somente no projeto/ambiente correto;
- confirmar que os dados de teste podem ser descartados ou fazer backup;
- registrar versões do commit, frontend, backend e schema;
- manter segredos fora de screenshots, logs e commits.

**Roteiro mínimo:**

1. criar categorias de gasto, recebimento e `both`;
2. criar compromissos com e sem categoria;
3. tentar combinações incompatíveis pela interface e pela API;
4. alterar nome e tentar alterar tipo de categoria usada;
5. arquivar e verificar histórico;
6. registrar, editar e excluir transações;
7. enviar descrição com 160 e 161 caracteres;
8. testar descrição composta por espaços;
9. executar o processador duas vezes e confirmar ausência de duplicidade;
10. testar importação com uma linha ambígua e uma linha válida;
11. repetir os testes com usuário A e usuário B;
12. conferir logs do Render e do workflow sem expor segredos.

**Evidências esperadas:** respostas HTTP e mensagens visíveis, registros criados e rejeitados, comportamento de categoria arquivada, execução do workflow automático, consulta dos dados no usuário correto e ausência de `[object Object]` e duplicidade.

**Migration:** aplicar somente migrations da etapa aprovada e confirmar o status no Supabase. Não considerar uma migration validada apenas porque o arquivo foi criado ou o deploy terminou.

**Critérios de aceite:** o fluxo completo passa em ambiente publicado de testes, incluindo a fronteira de acesso escolhida na etapa 1, sem alterar ou expor dados da conta pessoal.

**Rollback:** reverter o deploy para o commit anterior, interromper o workflow problemático e restaurar somente dados do ambiente de testes quando necessário. Não executar reset destrutivo no banco de produção.

**Dependência:** todas as etapas anteriores concluídas, migrations aplicadas e ambiente de testes preparado.

## Critérios de aceite

### Categorias

- Nenhuma nova transação ou compromisso grava categoria incompatível.
- Uma categoria arquivada não aparece para novos registros.
- O histórico continua exibindo a categoria arquivada.
- O tipo de uma categoria já usada não pode ser alterado sem um fluxo explícito de migração.
- Relações entre compromisso, categoria e transação seguem a mesma regra em todos os endpoints.

### Descrição longa

- O usuário é impedido de ultrapassar 160 caracteres no formulário.
- O contador informa o limite.
- Uma chamada direta à API continua sendo rejeitada pelo backend.
- A tela mostra uma mensagem compreensível em vez de `[object Object]`.
- Nenhum texto é truncado silenciosamente.

## Estado final desta análise

O problema da descrição longa é um bug confirmado de tratamento de erro no frontend.

O problema de categorias foi fechado nesta execução com validação na API e proteção por triggers na migration. A etapa de aplicação da migration e os testes de ambiente permanecem posteriores.

As etapas 2 a 6 foram autorizadas e executadas. A etapa 1 de segurança, os testes da etapa 7 e a validação remota da etapa 8 permanecem fora desta execução.

---

## Apêndice A — revisão de segurança (primeira parte)

Esta primeira parte da revisão de segurança foi adicionada ao planejamento existente sem remover ou substituir as decisões anteriores. A análise foi realizada sobre o checkout atual, sem alterar código, iniciar serviços, executar testes, migrations ou acessar o banco remoto.

### Conclusão inicial

Não foi encontrada falha evidente de autenticação, IDOR, SQL injection ou exposição atual de `service_role`. O desenho possui boas bases, mas há riscos concretos e várias validações importantes ainda não realizadas em ambiente real.

### O que está correto

- `.env` e `apps/frontend/.env.local` estão ignorados pelo Git.
- As chaves locais são do tipo `publishable`, não `service_role`.
- O frontend usa `NEXT_PUBLIC_` apenas para valores que podem ser públicos. Isso é esperado: qualquer variável com esse prefixo vai para o navegador. [Documentação do Next.js sobre variáveis públicas](https://nextjs.org/docs/app/guides/environment-variables)
- As rotas protegidas dependem de `current_user_id`.
- O backend valida o token diretamente no Supabase Auth.
- As queries SQL usam parâmetros `%s`, evitando SQL injection.
- As queries filtram por `user_id`.
- As tabelas possuem RLS e políticas com `auth.uid()`.
- O React renderiza os textos normalmente, sem `dangerouslySetInnerHTML`.

O ponto central: a chave pública do Supabase não precisa ser escondida. Ela pode estar no navegador. A proteção real está em grants, RLS e autorização correta. Já `DATABASE_URL`, `service_role`, chaves secretas, SMTP e tokens de CI precisam permanecer exclusivamente no servidor. [Supabase — API keys](https://supabase.com/docs/guides/getting-started/api-keys)

## Findings de segurança

### [CIFRO-SEC-001] Leitura ilimitada de upload antes do limite — High

Local: `apps/backend/app/main.py`, linha 1550.

O endpoint aceita arquivo enviado pelo usuário e executa:

```python
content = await file.read()

if len(content) > IMPORT_MAX_BYTES:
    raise HTTPException(...)
```

O limite de 10 MB é verificado somente depois que todo o arquivo foi lido. Além disso, CSVs e planilhas são convertidos inteiramente para listas em memória.

Um usuário autenticado pode enviar um arquivo muito maior que 10 MB, consumindo memória, CPU, disco temporário ou tempo de processamento. Um XLSX especialmente criado também pode ser pequeno comprimido e grande após descompactado.

Correção planejada:

- rejeitar pelo `Content-Length` quando possível;
- ler no máximo `IMPORT_MAX_BYTES + 1`;
- limitar quantidade de abas, linhas e células;
- validar o tipo real do arquivo;
- tratar planilhas corrompidas;
- aplicar rate limit específico nesse endpoint;
- configurar limite também no proxy/deploy.

### [CIFRO-SEC-002] Fórmula maliciosa no CSV exportado — Medium

Local: `apps/backend/app/main.py`, linha 1526.

Descrições, categorias e observações são controladas pelo usuário e exportadas para CSV:

```python
writer.writerow([
    row["description"],
    ...
    row["notes"] or "",
])
```

Um texto começando com `=`, `+`, `-` ou `@` pode ser interpretado como fórmula por Excel ou outro editor de planilhas. Isso pode gerar links, requisições externas ou fórmulas perigosas quando o arquivo for compartilhado e aberto por outra pessoa.

Não é um vazamento direto entre usuários no fluxo atual, mas é uma vulnerabilidade real no artefato exportado.

Correção:

- prefixar células textuais perigosas com `'`;
- tratar separadamente campos numéricos;
- adicionar teste específico para CSV injection.

### [CIFRO-SEC-003] Campo `notes` sem tamanho máximo — Medium

Local: `apps/backend/app/schemas.py`, linha 69.

`description` possui limite de 160 caracteres, mas `notes` não possui `max_length`. O usuário autenticado pode enviar valores enormes, armazená-los no PostgreSQL e fazer a API devolvê-los repetidamente.

É principalmente um risco de consumo de recursos e crescimento indevido do banco, não de acesso a dados de terceiros.

Correção:

- definir limite explícito para `notes`;
- aplicar limite global de corpo HTTP;
- limitar tamanho de respostas e exportações.

### Estado deste apêndice

Os findings acima ficam registrados como parte do planejamento de segurança. Eles não substituem as decisões funcionais já documentadas neste README e não autorizam, por si só, a implementação das correções. A revisão complementar será adicionada quando enviada.

## Registro de execução parcial — validações de arquivos e textos

**Data:** 02/09/2026  
**Escopo autorizado:** validações locais de arquivos, importação, exportação e textos.  
**Fora do escopo:** RLS, grants, Data API e qualquer validação remota de segurança.

### Correções executadas

- O upload agora lê no máximo `IMPORT_MAX_BYTES + 1` bytes antes de decidir se ultrapassou o limite de 10 MB.
- Extensões diferentes de `.csv` e `.xlsx` são rejeitadas antes da leitura do conteúdo.
- CSVs são limitados a 10.000 linhas e 100 colunas por aba.
- XLSX é limitado a 24 abas, 10.000 linhas e 100 colunas por aba.
- Arquivos XLSX corrompidos ou incompatíveis retornam erro controlado em vez de erro interno não tratado.
- Textos controlados pelo usuário na exportação CSV são prefixados com apóstrofo quando começam com `=`, `+`, `-`, `@` ou caracteres de controle, evitando interpretação automática como fórmula.
- `notes` passou a aceitar no máximo 2.000 caracteres na criação e na edição de transações.
- Descrições são removidas de espaços externos e descrições vazias ou compostas somente por espaços são rejeitadas.
- O frontend passou a traduzir erros estruturados do Pydantic e respostas de rede para mensagens legíveis, eliminando `[object Object]`.
- O campo de registro rápido passou a respeitar o limite visual de 160 caracteres e exibir contador; confirmação e edição também exibem contador.

### Arquivos alterados

- `apps/backend/app/main.py`;
- `apps/backend/app/schemas.py`;
- `apps/frontend/app/page.js`;
- `apps/frontend/app/globals.css`;
- `apps/backend/tests/test_imports_and_isolation.py`.

### Validação executada

- 20 testes automatizados passaram;
- o backend compilou com sucesso;
- o build de produção do frontend passou;
- foi confirmado por teste que o upload solicita somente o limite mais um byte;
- foram testados prefixos de CSV que poderiam ser interpretados como fórmula;
- foram testados XLSX corrompido, descrição nos limites 160/161, descrição somente com espaços e `notes` nos limites 2.000/2.001.

O build do frontend exibiu apenas o aviso já conhecido de que existe um `package-lock.json` fora da raiz do repositório; isso não impediu a compilação.

### Limites desta execução

- A proteção contra CSV Injection foi validada no gerador local de células, mas ainda precisa ser conferida abrindo o arquivo exportado em Excel, LibreOffice e Google Sheets.
- Os testes de upload simularam o objeto recebido pelo endpoint; ainda falta testar o limite no Render com proxy/deploy real.
- O limite de `notes` protege as rotas FastAPI, mas não protege uma escrita direta pela Data API enquanto a etapa de RLS/grants não for executada.
- Nenhuma migration foi aplicada naquela execução parcial; a migration de integridade foi criada na execução seguinte e ainda aguarda aplicação.
- O acesso direto ao Supabase, RLS, grants e isolamento remoto continuam pendentes para a etapa de estudo de segurança.

## Registro de execução — integridade de categorias e compromissos

**Data:** 02/09/2026  
**Escopo autorizado:** etapas 2 a 6, exceto a etapa 1 de segurança.  
**Testes e validação remota:** adiados para depois, conforme orientação do usuário.

### Correções executadas

- A alteração do tipo (`kind`) de uma categoria usada agora retorna `409 Conflict` com código `category_kind_immutable` e uma orientação para arquivar a categoria e criar outra.
- A verificação da API considera uso em movimentações, compromissos, configurações de orçamento, distribuições reutilizáveis e snapshots mensais.
- A migration `20260903003313_enforce_category_and_commitment_integrity.sql` reforça a imutabilidade semântica no banco, inclusive para operações que não passem pela API.
- Arquivar uma categoria continua permitido; a proteção bloqueia somente a mudança de tipo, preservando o histórico.
- Uma transação vinculada a um compromisso agora precisa ter exatamente a mesma categoria, inclusive no caso em que ambos devem estar sem categoria.
- A mesma regra também valida a direção da transação contra a direção do compromisso no banco.
- Um compromisso não pode trocar para uma categoria incompatível com ocorrências já vinculadas.
- As rotas de criação, edição e geração automática continuam usando a categoria do compromisso sem criar relações parciais.
- Erros de conflito foram estruturados com códigos estáveis para o frontend, que já consegue exibir o campo `message` sem produzir `[object Object]`.

### Arquivos alterados

- `apps/backend/app/main.py`;
- `supabase/migrations/20260903003313_enforce_category_and_commitment_integrity.sql`;
- `README_003_cifro.md`.

### Validação desta execução

- A migration foi criada com `npx supabase@latest migration new` porque o binário global `supabase` não está instalado neste ambiente.
- Não foram executados os testes da etapa 7 nem a validação remota da etapa 8, conforme solicitado.
- A migration ainda precisa ser aplicada no Supabase antes de considerar a proteção de banco ativa.

### Próxima execução

1. aplicar a migration no ambiente correto;
2. executar a matriz de testes da etapa 7;
3. validar no usuário de testes a API, o frontend e o processamento automático;
4. estudar e verificar separadamente RLS, grants e Data API na etapa 1.
