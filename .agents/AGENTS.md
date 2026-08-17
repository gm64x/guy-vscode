# Guia para agentes

## Objetivo

GUY é uma extensão para VS Code que gera grafos de fluxo de controle (CFGs) para Python, Java, PHP, C, Go e Rust. A extensão recebe o documento, uma seleção ou a função atual, converte a árvore Tree-sitter para uma IR neutra e renderiza o CFG em uma webview React.

## Regras de trabalho

- Preserve alterações locais que não foram feitas pela tarefa atual. Comece com `git --no-optional-locks status --short`.
- Faça mudanças pequenas e na causa do problema. Não adicione dependências sem necessidade.
- Rode `npm run check-types`, `npm run lint` e `npm run compile` após alterar TypeScript ou o empacotamento. Rode `npm test` quando mudar parsing, CFG, navegação ou webview.
- O projeto fixa Node 22 em `mise.toml`. Rode `mise install` uma vez e execute comandos com `mise exec -- npm <comando>` quando o mise não estiver ativado no shell; por exemplo, `mise exec -- npm test`.
- Não versione `dist/`, `out/`, `node_modules/`, `.vscode-test/` ou arquivos `.vsix`. Eles são artefatos gerados.

## Mapa da arquitetura

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
4. `CFGBuildSession` cria nós/arestas, modela retornos, loops e caminhos de exceção, calcula métricas e caminhos independentes.
5. `GuyWebviewPanel` envia o `CFG` serializável para a webview.
6. Mensagens da webview são validadas contra o CFG atual antes de selecionar código no editor.

## Estrutura de diretórios

| Caminho | Responsabilidade |
| --- | --- |
| `src/core/` | Parsing, IR, construção do CFG, métricas e tipos compartilhados. Não deve depender da API do VS Code nem de React. |
| `src/core/languages/` | Runtime Tree-sitter, registro das linguagens e adaptadores de gramática para a IR neutra. |
| `src/vscode/` | Integrações com editor, painel e mensagens da extensão. |
| `src/webview/` | Aplicação React e geração segura do HTML da webview. |
| `src/test/` | Testes executados pelo VS Code Test Electron. |
| `examples/` | Entradas manuais e fixtures demonstrativas por linguagem; não fazem parte do bundle. |
| `scripts/` | Automação auxiliar de desenvolvimento. O build principal permanece em `esbuild.js`, na raiz, por convenção. |
| `media/` | Recursos estáticos publicados com a extensão. |
| `.agents/` | Contexto operacional para agentes; deve ser versionado, mas excluído do VSIX. |

Mantenha arquivos de configuração reconhecidos pelas ferramentas na raiz (`package.json`, `mise.toml`, `tsconfig.json`, `eslint.config.mjs`, `esbuild.js` e `.vscode-test.mjs`). Não crie subpastas apenas para reduzir a quantidade de arquivos na raiz: isso adiciona caminhos e configuração sem separar responsabilidades.

## Parsing e IR

- `src/core/languages/model.ts` define a IR. Mantenha os adaptadores dependentes dessa IR, não de tipos VS Code.
- `statement`, `return`, `throw`, `break` e `continue` são nós simples.
- `if`, `loop`, `try`, `container` e `function` preservam filhos estruturados.
- `SourceRange` usa linhas e colunas baseadas em zero, como VS Code e Tree-sitter.
- Para seleções, aplique o `SourceOffset` exclusivamente por `rangeFromNode`; não ajuste posições novamente no builder.
- `treeSitter.ts` contém o ciclo de vida de parsers/árvores e a resolução de arquivos WASM. Sempre chame `delete()` para parser e árvore após parsing.

## Como adicionar ou corrigir uma linguagem

1. Confirme os tipos de nó e campos da gramática usando uma árvore Tree-sitter real.
2. Mude somente o adaptador em `src/core/languages/adapters/` quando a IR atual for suficiente.
3. Registre a linguagem e extensões em `src/core/languages/registry.ts`.
4. Atualize `package.json`: dependência de gramática, `activationEvents` e condições de menu.
5. Garanta que `esbuild.js` copie a gramática WASM para `dist/node_modules`.
6. Acrescente uma fixture/teste de parsing para arquivo, seleção e função quando aplicável.
7. Atualize README apenas se o suporte visível ao usuário mudou.

### Ativo WASM de Go e Rust

`tree-sitter-wasm@1.1.4` armazena as gramáticas em `out/go/tree-sitter-go.wasm` e `out/rust/tree-sitter-rust.wasm`. Os caminhos nos adaptadores e em `esbuild.js` devem permanecer idênticos. Se atualizar essa dependência, confirme a estrutura do pacote antes de alterar os caminhos.

## CFG e semântica

- `cfgBuilder.ts` deve preservar todos os caminhos abruptos. `return`, `throw`, `break` e `continue` devem atravessar blocos `finally` aplicáveis usando `routeAbrupt`.
- Exceções são intencionalmente type-agnostic: uma exceção pode alcançar handlers possíveis e uma rota não tratada. Não torne isso determinístico sem um analisador de tipos.
- No modo `simplified`, instruções simples consecutivas são agrupadas por `compactStatements`. Não agrupe instruções estruturadas nem altere suas faixas de origem.
- O limite de tamanho da fonte e de nós existe para manter a extensão responsiva. Não remova esses limites sem uma estratégia de streaming/virtualização.

## Testes relevantes

- `src/test/cfgBuilder.test.ts`: regressões de Python, `finally`, exceções e loops.
- `src/test/languageSupport.test.ts`: cobertura transversal das linguagens e offsets de seleção.
- `src/test/javaSupport.test.ts`: nós específicos de Java.
- `src/test/editorNavigation.test.ts`: não mover o editor ativo se o arquivo do CFG não puder ser aberto.
- `src/test/webviewPanel.test.ts`: validação de mensagens não confiáveis da webview.
- `src/test/webviewHtml.test.ts`: nonce CSP e escape do bootstrap JSON.

Ao corrigir uma regressão de fluxo, acrescente a menor asserção que distingue o caminho correto do incorreto. Prefira checar arestas/nós a snapshots completos do grafo.

## Scripts

| Comando | Uso |
| --- | --- |
| `npm run check-types` | Checagem estrita TypeScript sem emitir arquivos. |
| `npm run lint` | ESLint em `src`. |
| `npm run compile` | Tipos, lint e bundle de desenvolvimento. |
| `npm run package` | Bundle de produção. |
| `npm test` | Compila e executa testes no VS Code Test Electron. |
| `npm run package:vsix` | Produz pacote instalável `.vsix`. |
| `npm run vscode:dev` | Abre o VS Code de desenvolvimento no ambiente Linux/WSL. |

## Segurança e webview

- A webview é uma fronteira não confiável. Amplie `WebviewMessage` e `isValidWebviewMessage` juntos.
- Não aceite IDs, linhas ou ranges enviados pela webview sem confrontá-los com o `CFG` atual.
- Preserve nonce/CSP e o escape de `</script>` em `src/webview/webviewHtml.ts`.
- Limite `localResourceRoots` ao URI da extensão e evite interpolar texto de fonte em HTML sem serialização segura.

## Revisão final

Antes de concluir: confirme que os scripts relevantes passaram, consulte diagnósticos TypeScript, reveja `git diff` para evitar artefatos gerados e registre na resposta qualquer validação que não pôde ser executada.
