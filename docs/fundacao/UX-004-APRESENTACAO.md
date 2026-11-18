# UX-004 — Apresentação em 18/11/2026

[Issue #56](https://github.com/larabeatrizs/ERP_Restaurantes_Joinville/issues/56). A responsável priorizou somente ajustes visuais para apresentar o site hoje: retirar Configurações, tornar a interface mais limpa, suavizar botões e antecipar o skeleton antes adiado na issue #24. Isso substitui a prioridade imediata da jornada mutativa EST-002, que continua pendente na #52.

## Recorte autorizado

Configurações sai da navegação e do Início; o componente de tela foi removido do bundle. Parâmetros persistidos, APIs e validações de negócio permanecem necessários às operações; não há reset ou mudança de valor. O Configurador de usuários continua separado. O Style Guide original não foi reescrito: a orientação visual explícita de 18/11 autoriza esta evolução, preservando vinho, Manrope/DM Sans e foco de teclado.

Sidebar clara com item ativo suave, superfícies neutras, cartões com bordas/sombras discretas e botões com borda de 1 px/peso menor. Alvos de toque continuam com pelo menos 44 px; foco contrastante preservado. Em celular, menu horizontal rolável reduz a altura ocupada pela navegação sem gerar overflow da página.

`Skeleton.tsx` reutilizável em sessão, unidades, listas/cadastros, calendário, requisições e administração. O Início usa cartões de placeholder no lugar dos indicadores enquanto espera a resposta. `role=status`/rótulo e `aria-busy` anunciam carregamento; formas decorativas são ocultas de leitores de tela. `prefers-reduced-motion` desliga a animação; erros/estados vazios mantêm mensagens próprias. Nenhum número/controle fictício é apresentado como dado real.

## Verificação e limites

Rastreabilidade: solicitação visual de 18/11 → Workspace/HomePanel/estilos/Skeleton → testes de navegador de acesso, carregamento e apresentação; RNF-009/RNF-011. Nenhuma nova alteração de API, banco, capacidades ou senha neste recorte.

Treze testes dirigidos de navegador passaram em Edge após corrigir a largura mínima do menu móvel; screenshots locais desktop/mobile inspecionadas. A suíte completa de navegador passou com **75 cenários**. Os cenários exclusivos da View de Configurações retirada foram removidos e substituídos por teste de ausência da tela e skeleton/movimento reduzido/toque. Os testes HTTP/DB de configurações continuam executados; a redução dessa contagem de E2E é mudança de escopo da View, não perda silenciosa de cobertura de regra de negócio. CI e publicação serão registradas na PR/issue com os resultados efetivamente obtidos.

`scripts/staging/verificar-apresentacao.mjs` prepara consulta hospedada com conta ADMIN sintética, screenshots em 1280/768/360, carregamento real atrasado apenas para observar skeleton e contador de zero escritas de negócio. Não usar a conta pessoal como fixture. Dados sintéticos anteriores e acesso existente devem permanecer preservados. Não confundir esta apresentação com conclusão do ERP, aceite operacional ou jornada de retirada já comprovada no staging.
