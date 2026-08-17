# AGENTS.md

## Escopo e prioridade

Estas instruções se aplicam a todo o repositório. Instruções mais próximas do arquivo alterado, quando existirem, têm precedência. A solicitação explícita do usuário prevalece sobre este documento.

## Visão geral do projeto

GUY é uma extensão para VS Code que gera grafos de fluxo de controle (CFGs) para Python, Java, PHP, C, Go e Rust. A extensão recebe o documento, uma seleção ou a função atual, converte a árvore Tree-sitter para uma IR neutra e renderiza o CFG em uma webview React.

## Preparação do ambiente

- O projeto fixa Node 22 em `mise.toml`.
- Instale as ferramentas com `mise install`.
- Instale as dependências com `npm install`.
- Se o `mise` não estiver ativado no shell, prefixe os comandos com `mise exec --`; por exemplo, `mise exec -- npm test`.

## Fluxo de trabalho

1. Comece com `git --no-optional-locks status --short` e preserve alterações locais fora da tarefa.
2. Leia os arquivos e testes relacionados antes de editar. Procure padrões existentes antes de criar abstrações.
3. Faça a menor mudança que resolva a causa do problema. Não adicione dependências sem necessidade.
4. Adicione ou ajuste o menor teste capaz de distinguir o comportamento correto do incorreto.
5. Execute primeiro a validação mais específica e depois os checks aplicáveis da seção abaixo.
6. Antes de concluir, consulte os diagnósticos TypeScript e revise `git diff` para detectar mudanças acidentais ou artefatos gerados.
7. Informe quais validações foram executadas e quais não puderam ser executadas.

Não versione `dist/`, `out/`, `node_modules/`, `.vscode-test/` nem arquivos `.vsix`; são artefatos gerados.

## Comandos de desenvolvimento

| Comando | Quando executar |
| --- | --- |
| `npm run check-types` | Após alterar TypeScript. Faz checagem estrita sem emitir arquivos. |
| `npm run lint` | Após alterar arquivos em `src/`. |
| `npm run compile` | Após alterar TypeScript ou empacotamento. Inclui tipos, lint e bundle de desenvolvimento. |
| `npm test` | Após mudar parsing, CFG, navegação, mensagens ou webview. Compila e executa testes no VS Code Test Electron. |
| `npm run package` | Para validar o bundle de produção. |
| `npm run package:vsix` | Para produzir um pacote instalável `.vsix`, somente quando solicitado. |
| `npm run vscode:dev` | Para abrir o VS Code de desenvolvimento no ambiente Linux/WSL. |

Mudanças somente em documentação não exigem build nem testes. Não corrija falhas preexistentes e alheias à tarefa; registre-as na resposta final.

## Convenções de código

- Siga o estilo e os padrões dos arquivos vizinhos; mantenha TypeScript estrito.
- Preserve as fronteiras entre `core`, integração VS Code e webview.
- Prefira tipos explícitos nas fronteiras e valide dados não confiáveis antes de usá-los.
- Não crie abstrações, configurações ou dependências para necessidades especulativas.
- Não adicione comentários que apenas repitam o código; documente somente decisões ou restrições não óbvias.
- Mantenha arquivos de configuração reconhecidos pelas ferramentas na raiz: `package.json`, `mise.toml`, `tsconfig.json`, `eslint.config.mjs`, `esbuild.js` e `.vscode-test.mjs`.
- Não crie subpastas apenas para reduzir a quantidade de arquivos na raiz; isso adiciona caminhos e configuração sem separar responsabilidades.

## Arquitetura

```text
src/extension.ts
  comandos VS Code e estado da sessão
  ├─ src/core/cfgBuilder.ts
  │    constrói CFG a partir da IR neutra
  ├─ src/core/languages/
  │    Tree-sitter WASM, registro e adaptadores por linguagem
  ├─ src/vscode/editorNavigation.ts
  │    navegação e destaque no editor
  └─ src/vscode/webviewPanel.ts
       mensagens validadas para a webview
       └─ src/webview/App.tsx
            renderização React do grafo
```

### Pipeline de geração

1. `extension.ts` valida o editor e monta `GenerateCFGOptions`.
2. `CFGBuilder.generate` resolve o parser da linguagem no registro.
3. `TreeSitterLanguageParser` carrega o runtime e a gramática WASM, transforma a árvore com o adaptador e coleta funções.
4. `CFGBuildSession` cria nós e arestas, modela retornos, loops e caminhos de exceção e calcula métricas e caminhos independentes.
5. `GuyWebviewPanel` envia o `CFG` serializável para a webview.
6. Mensagens da webview são validadas contra o CFG atual antes de selecionar código no editor.

### Responsabilidades por diretório

| Caminho | Responsabilidade |
| --- | --- |
| `src/core/` | Parsing, IR, construção do CFG, métricas e tipos compartilhados. Não depende da API do VS Code nem de React. |
| `src/core/languages/` | Runtime Tree-sitter, registro das linguagens e adaptadores de gramática para a IR neutra. |
| `src/vscode/` | Integrações com editor, painel e mensagens da extensão. |
| `src/webview/` | Aplicação React e geração segura do HTML da webview. |
| `src/test/` | Testes executados pelo VS Code Test Electron. |
| `examples/` | Entradas manuais e fixtures demonstrativas por linguagem; não fazem parte do bundle. |
| `scripts/` | Automação auxiliar. O build principal permanece em `esbuild.js`, na raiz. |
| `media/` | Recursos estáticos publicados com a extensão. |
| `.agents/` | Contexto operacional para agentes; deve ser versionado, mas excluído do VSIX. |

## Parsing e IR

- `src/core/languages/model.ts` define a IR. Os adaptadores devem depender dela, não de tipos do VS Code.
- `statement`, `return`, `throw`, `break` e `continue` são nós simples.
- `if`, `loop`, `try`, `container` e `function` preservam filhos estruturados.
- `SourceRange` usa linhas e colunas baseadas em zero, como VS Code e Tree-sitter.
- Para seleções, aplique o `SourceOffset` exclusivamente por `rangeFromNode`; não ajuste posições novamente no builder.
- `treeSitter.ts` contém o ciclo de vida de parsers e árvores e a resolução de arquivos WASM. Sempre chame `delete()` para parser e árvore após o parsing.

## Adicionar ou corrigir uma linguagem

1. Confirme os tipos de nó e campos da gramática usando uma árvore Tree-sitter real.
2. Altere somente o adaptador em `src/core/languages/adapters/` quando a IR atual for suficiente.
3. Registre a linguagem e suas extensões em `src/core/languages/registry.ts`.
4. Atualize `package.json`: dependência de gramática, `activationEvents` e condições de menu.
5. Garanta que `esbuild.js` copie a gramática WASM para `dist/node_modules`.
6. Acrescente uma fixture ou teste de parsing para arquivo, seleção e função, quando aplicável.
7. Atualize o README somente se o suporte visível ao usuário mudar.

### Ativos WASM de Go e Rust

`tree-sitter-wasm@1.1.4` armazena as gramáticas em `out/go/tree-sitter-go.wasm` e `out/rust/tree-sitter-rust.wasm`. Os caminhos nos adaptadores e em `esbuild.js` devem permanecer idênticos. Ao atualizar essa dependência, confirme a estrutura do pacote antes de alterar os caminhos.

## CFG e semântica

- `cfgBuilder.ts` deve preservar todos os caminhos abruptos. `return`, `throw`, `break` e `continue` devem atravessar blocos `finally` aplicáveis por meio de `routeAbrupt`.
- Exceções são intencionalmente *type-agnostic*: uma exceção pode alcançar handlers possíveis e uma rota não tratada. Não torne esse fluxo determinístico sem um analisador de tipos.
- No modo `simplified`, instruções simples consecutivas são agrupadas por `compactStatements`. Não agrupe instruções estruturadas nem altere suas faixas de origem.
- Os limites de tamanho da fonte e de quantidade de nós mantêm a extensão responsiva. Não os remova sem uma estratégia de streaming ou virtualização.

## Testes

| Arquivo | Cobertura principal |
| --- | --- |
| `src/test/cfgBuilder.test.ts` | Regressões de Python, `finally`, exceções e loops. |
| `src/test/languageSupport.test.ts` | Cobertura transversal das linguagens e offsets de seleção. |
| `src/test/javaSupport.test.ts` | Nós específicos de Java. |
| `src/test/editorNavigation.test.ts` | Comportamento quando o arquivo do CFG não pode ser aberto. |
| `src/test/webviewPanel.test.ts` | Validação de mensagens não confiáveis da webview. |
| `src/test/webviewHtml.test.ts` | Nonce CSP e escape do bootstrap JSON. |

Ao corrigir uma regressão de fluxo, prefira a menor asserção sobre nós ou arestas que capture o caso. Evite snapshots completos do grafo.

## Segurança da webview

- Trate a webview como uma fronteira não confiável. Amplie `WebviewMessage` e `isValidWebviewMessage` juntos.
- Não aceite IDs, linhas ou ranges enviados pela webview sem confrontá-los com o `CFG` atual.
- Preserve nonce, CSP e o escape de `</script>` em `src/webview/webviewHtml.ts`.
- Limite `localResourceRoots` ao URI da extensão.
- Não interpole texto-fonte em HTML sem serialização segura.

## Checklist de entrega

- [ ] A mudança está limitada ao escopo pedido e preserva alterações locais.
- [ ] Testes foram adicionados ou ajustados quando o comportamento mudou.
- [ ] Os comandos aplicáveis passaram com Node 22.
- [ ] Diagnósticos TypeScript foram consultados.
- [ ] `git diff` não contém artefatos gerados nem mudanças acidentais.
- [ ] A resposta final resume os arquivos alterados e a validação executada.
