# Instruções para Claude Code neste projeto

## Skills de design sobrepostas (decisão deliberada)

O projeto tem, de propósito, múltiplos pacotes de skills cobrindo a mesma área —
"direção estética / tirar cara de genérico" — instalados ao mesmo tempo:

- **interface-design** (skill global) — processo de craft: intenção, exploração de
  domínio, hierarquia visual, checklist anti-genérico.
- **ui-ux-pro-max** (plugin global) → skills `design` e `ui-ux-pro-max` — banco de
  dados pesquisável de 84 estilos, 192 paletas, 74 pares de fonte, gráficos e stacks.
- **ux-ui-agent-skills** (vendorizado neste repo) → skills `apply-aesthetic` e
  `redesign` — aplica um dos 138 design-systems nomeados (stripe, linear, notion…)
  ou faz upgrade cirúrgico de uma UI existente.

Antes de aplicar qualquer uma dessas três a uma tarefa de design/estética,
**pergunte ao usuário qual abordagem usar para aquela tarefa** em vez de escolher
uma automaticamente ou misturar as três.

Outras sobreposições identificadas (design-review do `interface-design` vs. skill
`design-review` do `ux-ui-agent-skills`; tokens via `design-system` do
`ui-ux-pro-max` vs. `design-tokens`/`token-build` do `ux-ui-agent-skills`;
performance via `performance-optimization`/`web-performance-auditor`/`/webperf`
do `agent-skills` vs. skill `performance` do `ux-ui-agent-skills`) foram mantidas
por decisão explícita — pode usar qualquer uma delas, ou as duas, sem precisar
perguntar.
