# Cifro — refinamento visual e de legibilidade

**Status:** refinamento visual e reorganização mobile implementados localmente; validação visual autenticada pendente

**Data da decisão:** 03/09/2026

**Repositório:** `/home/jeanlc77/Documents/ChatGPT/Cifro`

## Achados

- a paleta escura, o azul principal e as cores semânticas já formam uma identidade coerente;
- a distribuição ampla no computador ocupa o espaço de forma útil e deve ser preservada;
- títulos em Manrope funcionam bem, mas valores e metadados em DM Mono deixam a interface com aparência técnica e robótica;
- textos importantes entre 8 e 11 px prejudicam leitura e tornam informações secundárias quase invisíveis;
- linhas horizontais são usadas para separar cabeçalhos, formulários, resumos e listas, criando uma grade excessiva;
- o registro rápido apresenta uma borda de foco dentro de outra borda;
- o gráfico vazio da visão geral desenha uma evolução que ainda não representa dados reais;
- alguns rótulos em caixa alta repetem o título que já aparece logo abaixo;
- instruções importantes, como a regra de dias úteis, estão distantes do controle que explicam.

## Recomendação

Preservar a identidade cromática e a estrutura ampla do Cifro, substituindo a linguagem de terminal por uma linguagem financeira calma, legível e direta.

### Sistema visual

Paleta principal:

- **Fundo profundo:** `#060A17`;
- **Navegação:** `#090F20`;
- **Superfície de ação:** `#0D1529`;
- **Texto principal:** `#F3F5FB`;
- **Texto secundário legível:** `#A6AEC1`;
- **Azul Cifro:** `#7695FF`.

As cores verde e vermelha permanecem reservadas para entrada, confirmação, saída e alerta.

Tipografia:

- **Títulos:** Manrope, com pesos 600 a 800 e espaçamento compacto;
- **Texto e controles:** Manrope, com tamanhos confortáveis e linguagem direta;
- **Valores e dados:** Manrope com numerais tabulares, sem fonte monoespaçada.

Estrutura:

- manter a barra lateral e as composições principais em duas colunas no computador;
- usar espaço e hierarquia tipográfica como separação principal;
- manter linhas somente onde elas ajudam a comparar registros ou valores;
- reservar superfícies levemente elevadas para áreas de ação, sem transformar toda seção em cartão.

Assinatura visual:

- a comparação entre dinheiro atual e futuro continua sendo o elemento característico do Cifro;
- barras, saldos e estados devem transmitir continuidade financeira sem gráficos decorativos.

## Decisão aprovada

O usuário aprovou em 03/09/2026:

- manter cores e estrutura ampla atuais;
- conservar Manrope e remover DM Mono da interface;
- aumentar textos, valores secundários, rótulos, campos e ações;
- reduzir linhas decorativas;
- corrigir o foco com caixa dentro de caixa no registro rápido;
- remover o gráfico fictício do estado vazio;
- simplificar rótulos e textos repetitivos;
- manter informações funcionais, como diferença entre real e previsto e regra de dias úteis, mas reposicioná-las;
- aplicar a direção ao código antes da etapa específica de reorganização mobile.

## Decisão mobile aprovada

O usuário aprovou em 03/09/2026 que a versão para celular seja reorganizada com autonomia de design, desde que preserve as funções do computador e reduza a sensação de conteúdo espremido, excesso de texto e rolagem vertical.

Direção adotada:

- tratar o celular como uma composição própria da mesma aplicação, não como o desktop comprimido;
- manter as quatro áreas de uso diário acessíveis e agrupar funções menos frequentes em “Mais”;
- retirar cabeçalhos duplicados quando o título funcional da tela já comunica a tarefa;
- recolher resumos e explicações secundárias, mantendo-os disponíveis sob demanda;
- compactar faixas auxiliares, listas e formulários sem reduzir a legibilidade nem as áreas de toque;
- impedir o zoom automático do Safari em campos sem bloquear o zoom manual do usuário.

## Etapa planejada

1. atualizar tokens, tipografia e tamanhos globais;
2. reduzir separadores decorativos e preservar divisões funcionais;
3. refinar Visão geral, Registrar e Planejamento;
4. propagar a mesma linguagem para Simulador, Distribuição, Categorias, Dados e Configurações;
5. validar compilação e inspecionar a renderização no computador e no celular quando houver sessão autenticada disponível.

## Implementação

- removida a importação de DM Mono e aplicado Manrope também a valores, datas e estados;
- ativados numerais tabulares para preservar o alinhamento de valores monetários;
- ampliados textos secundários, rótulos, campos, botões, valores de listas e metadados em todas as áreas;
- elevado o contraste dos textos secundários sem alterar a identidade cromática;
- removidas linhas decorativas de cabeçalhos, formulários e áreas de criação;
- preservadas linhas suaves em históricos, agendas e resumos onde a comparação entre itens continua necessária;
- removido o ícone ambíguo do período na Visão geral;
- removidos “Dados reais” e rótulos repetitivos como “Registro rápido”, “Agenda” e “Movimentações”;
- compactado o resumo de distribuição da Visão geral em uma faixa informativa com ação “Ajustar”;
- substituído o gráfico fictício por um estado vazio honesto, com explicação e ação para registrar movimentação;
- unificado o título “Movimentações recentes”;
- corrigido o foco do registro rápido para usar somente a borda externa;
- reescrita a instrução do registro em linguagem direta;
- exibida a explicação de dias úteis somente quando essa regra é selecionada;
- removida a mensagem redundante sobre o compromisso não criar gasto real;
- adicionada escala de 16 px aos campos no celular para leitura e foco mais confortáveis;
- preservadas as grades amplas e as colunas laterais existentes no computador.

### Implementação mobile

- substituída a navegação horizontal superior por uma barra inferior fixa com Visão, Registrar, Planejar, Simular e Mais;
- criado um painel móvel em “Mais” para Distribuição, Categorias, Dados, Configurações e saída da conta;
- removidos no celular os cabeçalhos de página que repetiam o título funcional logo abaixo;
- transformados resumos laterais de Planejamento, Distribuição, Categorias, Dados e Configurações em seções recolhíveis;
- mantida a troca de cenários do Simulador no início da tela móvel, em uma faixa horizontal compacta;
- transformada a comparação entre mês atual e próximo em cartões horizontais com encaixe por gesto;
- removido da tela móvel o estado vazio de evolução, priorizando movimentações recentes;
- convertidas categorias e exemplos rápidos em faixas horizontais compactas;
- usados dois campos por linha em aparelhos com largura suficiente nos formulários mais longos;
- adicionados suporte às áreas seguras do iPhone e cor de interface coerente com o fundo do Cifro;
- mantidos campos em 16 px no celular para evitar o zoom automático do Safari, sem desativar a ampliação manual.

## Validação

- `npm run build`: concluído com sucesso no Next.js 16.3.3;
- as nove rotas do frontend foram compiladas e pré-renderizadas;
- a página de acesso foi aberta localmente sem tela vazia nem sobreposição de erro;
- a fonte Manrope e a nova escala de formulário foram confirmadas visualmente na página de acesso;
- as telas internas autenticadas ainda não foram verificadas visualmente no endereço local porque não havia uma sessão autenticada nesse domínio;
- a nova estrutura mobile compilou junto às nove rotas;
- a validação visual das telas internas ainda depende de uma sessão autenticada no ambiente em que o código será aberto.
