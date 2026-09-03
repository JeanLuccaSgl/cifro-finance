# Cifro — simulador rápido de cenários financeiros

**Status:** implementação concluída; validação funcional pendente

**Data da decisão:** 02/09/2026

**Repositório:** `/home/jeanlc77/Documents/ChatGPT/Cifro`

## Objetivo

Criar uma nova aba chamada **Simulador**, funcionando como uma calculadora financeira persistente.

O usuário deve conseguir montar rapidamente um cenário, adicionando entradas e saídas, e visualizar quanto ficará disponível depois de cada item. A simulação deve continuar salva para que não seja necessário refazer a conta quando o usuário quiser alterar um valor, retirar uma compra ou comparar possibilidades.

O simulador é uma ferramenta de apoio à decisão. Ele não substitui o planejamento mensal e não registra movimentações reais.

## Decisões de produto

### 1. Categoria organiza, mas não bloqueia o dinheiro

Categorias serão usadas para classificar e analisar os itens. Elas não representam uma restrição de uso do valor.

Exemplo: o usuário pode adicionar `VR` como uma entrada e classificá-lo como `Alimentação`, mas o valor continuará participando do saldo geral da simulação.

Essa é uma escolha consciente para manter o simulador simples e compatível com a forma como o usuário administra os próprios recursos.

O sistema deve deixar clara a origem e a categoria do item, mas não deve impedir uma saída apenas porque a categoria da entrada possui uma finalidade específica.

### 2. O simulador terá várias simulações salvas

Não limitar o usuário a um único registro global.

Deve ser possível:

- abrir a última simulação utilizada;
- criar uma nova simulação;
- editar uma simulação já salva;
- duplicar uma simulação para comparar cenários;
- excluir uma simulação inteira;
- excluir ou editar itens dentro da simulação.

Não é necessário criar histórico de versões. Uma simulação é um cenário editável, e a exclusão de um cenário hipotético pode ser definitiva após confirmação.

### 3. A simulação deve ser persistente

Depois que uma simulação for criada, suas alterações não devem depender apenas do estado da tela.

O fluxo recomendado é:

1. o usuário cria ou abre uma simulação;
2. adiciona, edita ou remove itens;
3. o sistema salva as alterações automaticamente ou por uma operação clara de salvar;
4. a tela mostra um estado curto, como `Salvo` ou `Salvando`.

O usuário não deve perder todo o cenário ao atualizar a página, fechar a aba ou navegar para outra área do sistema.

### 4. A ordem dos itens pertence à simulação

Cada item deve aparecer em uma sequência, e o saldo disponível será calculado progressivamente nessa ordem.

A ordem não altera o resultado final, mas altera o quanto aparece disponível depois de cada decisão. Por isso, a interface deve permitir reorganizar os itens de maneira simples, preferencialmente com ações `mover para cima` e `mover para baixo`. Drag and drop não é necessário para a primeira versão.

## Experiência esperada

Ao entrar na aba **Simulador**, o usuário deve encontrar:

- a última simulação aberta ou salva em destaque;
- uma ação evidente para `Nova simulação`;
- uma lista simples de outras simulações salvas;
- opção de duplicar, editar e excluir cada cenário.

Ao abrir uma simulação, a tela deve priorizar a velocidade da conta:

1. nome do cenário, com valor padrão caso o usuário não informe um nome;
2. referência opcional, como mês ou objetivo;
3. formulário rápido para adicionar um item;
4. lista ordenada de itens;
5. saldo acumulado ao lado de cada item;
6. resumo final e gastos agrupados por categoria.

O formulário de item deve conter somente o necessário:

- descrição;
- tipo: `Entrada` ou `Saída`;
- valor;
- categoria opcional para entradas e recomendada/selecionável para saídas.

Não criar, na primeira versão, telas complexas de fórmulas, gráficos, metas ou regras automáticas.

## Exemplo de funcionamento

| Ordem | Item | Tipo | Categoria | Valor | Disponível após o item |
|---:|---|---|---|---:|---:|
| 1 | Salário | Entrada | Renda | R$ 3.000,00 | R$ 3.000,00 |
| 2 | VR | Entrada | Alimentação | R$ 600,00 | R$ 3.600,00 |
| 3 | Assinaturas | Saída | Fixos | R$ 100,00 | R$ 3.500,00 |
| 4 | Roupa | Saída | Compras | R$ 300,00 | R$ 3.200,00 |
| 5 | Produto desejado | Saída | Compras | R$ 800,00 | R$ 2.400,00 |

O resumo deve mostrar, no mínimo:

- total de entradas: `R$ 3.600,00`;
- total de saídas: `R$ 1.200,00`;
- disponível ao final: `R$ 2.400,00`;
- total por categoria de saída, como `Fixos: R$ 100,00` e `Compras: R$ 1.100,00`.

## Regras de cálculo

Para cada item:

- `Entrada` soma o valor ao saldo acumulado;
- `Saída` subtrai o valor do saldo acumulado;
- o valor deve ser positivo no formulário;
- o tipo define se o valor será somado ou subtraído;
- o saldo inicial da primeira versão é zero;
- o saldo final é `total de entradas - total de saídas`.

Não permitir que o usuário informe valores negativos para tentar representar uma saída. Isso evita registros ambíguos como uma saída de `-100` ou uma entrada de `-500`.

O simulador deve continuar exibindo o resultado mesmo que o saldo fique negativo. Saldo negativo é um resultado válido de cenário e deve ser apresentado claramente como déficit, sem bloquear a simulação.

## Categorias

As categorias existentes devem ser reutilizadas para classificar os itens quando fizer sentido.

Regras recomendadas:

- categoria não altera a fórmula do saldo;
- categoria não limita uma entrada ou saída;
- categorias arquivadas não devem aparecer para novos itens;
- itens antigos continuam mostrando a categoria que foi registrada no momento da simulação;
- saídas sem categoria podem ser aceitas, mas devem aparecer como `Sem categoria` no resumo;
- o resumo por categoria deve considerar somente saídas, pois o objetivo principal é mostrar onde o dinheiro está sendo gasto;
- entradas continuam identificadas por sua descrição e categoria, mas não devem ser misturadas ao total de gastos.

## Relação com o planejamento

A primeira experiência deve permitir adicionar itens manualmente, pois esse é o caminho mais rápido e garante que a calculadora funcione mesmo sem integração adicional.

Como melhoria útil, pode existir uma ação `Adicionar do planejamento`, que abre os compromissos previstos e permite selecionar quais serão copiados para a simulação.

Quando um compromisso for copiado:

- deve ser criado um item independente na simulação;
- a descrição, o valor e a categoria devem ser copiados naquele momento;
- editar o item simulado não pode alterar o compromisso original;
- editar o compromisso original depois não deve modificar silenciosamente a simulação já salva;
- o item pode guardar a origem `planejamento` para facilitar a identificação.

Não importar automaticamente todos os compromissos nem transformar a simulação em uma extensão do planejamento. A cópia deve sempre ser uma ação explícita do usuário.

## Separação estrutural

As simulações devem possuir armazenamento e regras próprios, separados de:

- transações reais;
- compromissos do planejamento;
- orçamento mensal;
- distribuição de orçamento.

Conceitualmente, a estrutura deve conter:

### Simulação

Representa o cenário salvo.

Campos esperados:

- identificador;
- usuário proprietário;
- nome;
- referência opcional do cenário;
- data de criação;
- data de atualização;
- indicação opcional de arquivamento, se esse padrão já for necessário no sistema.

### Item da simulação

Representa cada linha da calculadora.

Campos esperados:

- identificador;
- identificador da simulação;
- usuário proprietário, para isolamento consistente;
- posição na ordem da simulação;
- descrição;
- tipo `income` ou `expense`;
- valor positivo armazenado como valor monetário preciso;
- categoria opcional;
- origem opcional `manual` ou `planning`;
- data de criação e atualização.

As tabelas não devem reutilizar `transactions` para armazenar simulações. Fazer isso misturaria hipótese com fato e poderia contaminar histórico, orçamento, relatórios ou processamento de compromissos.

## Operações necessárias

### Simulações

- listar simulações do usuário;
- criar simulação;
- consultar uma simulação com seus itens e totais;
- editar nome ou referência;
- duplicar simulação;
- excluir simulação com confirmação.

### Itens

- adicionar item;
- editar descrição, tipo, valor ou categoria;
- excluir item;
- alterar posição;
- recalcular totais e saldo acumulado.

### Integração opcional

- listar compromissos elegíveis do planejamento;
- selecionar compromissos;
- copiar os selecionados para uma simulação.

## Critérios de aceitação

A implementação estará adequada quando:

1. o usuário conseguir criar uma simulação em poucos passos;
2. adicionar salário, VR, venda ou qualquer outra entrada;
3. adicionar compras, assinaturas e contas como saídas;
4. visualizar o saldo após cada item sem fazer contas manualmente;
5. visualizar o saldo final e o total gasto por categoria;
6. editar o valor ou a descrição de qualquer item;
7. remover um item sem precisar recriar a simulação;
8. sair e voltar ao sistema sem perder a simulação salva;
9. criar uma segunda simulação para comparação;
10. duplicar uma simulação e alterar somente o item desejado;
11. excluir uma simulação com confirmação;
12. manter transações reais e planejamento inalterados;
13. aceitar saldo negativo e apresentá-lo como resultado, sem erro técnico;
14. impedir valores monetários ambíguos ou negativos no formulário;
15. manter categorias somente como classificação, sem bloquear o uso do saldo.

## Fora do escopo inicial

Não incluir nesta etapa:

- separação automática de saldo por carteira, como salário, VR e dinheiro;
- controle de limite de cartão;
- parcelas e recorrências próprias do simulador;
- gráficos avançados;
- previsão automática baseada em inteligência artificial;
- sincronização contínua com o planejamento;
- histórico de todas as versões de uma simulação;
- fórmulas personalizadas;
- lançamento automático da simulação como transação real.

Esses recursos podem ser avaliados depois que a calculadora simples estiver funcionando e for usada na prática.

## Ordem recomendada de execução

### Etapa 1 — domínio e banco

- definir a migration das simulações e dos itens;
- definir valores monetários com precisão adequada;
- garantir isolamento por usuário;
- definir exclusão em cascata dos itens ao excluir uma simulação;
- definir as regras de posição e recálculo.

### Etapa 2 — API

- criar schemas de entrada e resposta;
- criar endpoints de simulação;
- criar endpoints de itens;
- criar operação de duplicação;
- retornar totais e saldo acumulado de forma consistente;
- cobrir as regras com testes unitários e de integração apropriados.

### Etapa 3 — interface

- adicionar a aba `Simulador` à navegação;
- criar a lista de cenários;
- criar o formulário rápido de item;
- exibir saldo acumulado por linha;
- exibir resumo final e agrupamento por categoria;
- permitir edição, remoção, reordenação e duplicação;
- mostrar estado de salvamento e mensagens de erro legíveis.

### Etapa 4 — integração opcional

- adicionar seleção manual de compromissos do planejamento;
- copiar os dados como snapshot independente;
- deixar a origem visível na simulação;
- testar que alterações posteriores não vazem para o planejamento.

## Observação para execução

Esta especificação prioriza rapidez e clareza. A tela deve parecer uma calculadora que salva o trabalho, e não um formulário burocrático.

O executor deve preservar as separações existentes do sistema e não incorporar simulações às transações reais. Qualquer decisão necessária que altere esse escopo deve retornar para planejamento antes da implementação.

## Registro de execução

**Data:** 02/09/2026  
**Escopo executado:** etapas 1, 2, 3 e 4 desta especificação.  
**Validação:** compilação do backend, validação dos schemas e build de produção do frontend passaram. Os testes funcionais automatizados e o teste no Supabase publicado ainda serão executados em etapa posterior.

### Implementado

- Criadas as tabelas `simulations` e `simulation_items`, separadas de transações reais, compromissos e orçamento mensal.
- Adicionado isolamento por `user_id`, chaves estrangeiras compostas, exclusão em cascata dos itens e RLS para as novas tabelas.
- Adicionadas validações de nome, descrição, valor positivo, tipo, origem e categoria ativa.
- Criados endpoints para listar, criar, consultar, editar, duplicar e excluir simulações.
- Criados endpoints para adicionar, editar, excluir e reordenar itens.
- O backend calcula entradas, saídas, saldo final, saldo progressivo e gastos agrupados por categoria usando valores monetários precisos.
- Categorias permanecem classificatórias e não bloqueiam o uso do saldo; entradas não são misturadas ao agrupamento de gastos.
- Adicionada a aba `Simulador` à navegação, com estado salvo, cenários, resumo, saldo por linha, edição, exclusão, duplicação e ações de ordem.
- Adicionada cópia explícita de compromissos do planejamento. A cópia recebe `source = planning` e torna-se independente do compromisso original.
- Saldos negativos continuam visíveis como resultado válido do cenário.

### Arquivos alterados

- `apps/backend/app/main.py`;
- `apps/backend/app/domain/simulations.py`;
- `apps/backend/app/schemas.py`;
- `apps/frontend/app/page.js`;
- `apps/frontend/app/globals.css`;
- `apps/frontend/app/simulador/page.js`;
- `supabase/migrations/20260903015940_create_simulations.sql`.

### Pendências de validação

- Executar a migration no ambiente Supabase correto.
- Executar os testes automatizados da função e verificar a matriz de isolamento entre usuários.
- Testar no navegador criação, edição, exclusão, duplicação, reordenação, saldo negativo e cópia do planejamento.
- Confirmar que o refresh da página e a navegação preservam o cenário salvo.
