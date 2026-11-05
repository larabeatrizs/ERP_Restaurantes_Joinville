# ERP - Restaurantes Populares de Joinville

Este repositório contém a estrutura base do sistema ERP para a gestão dos Restaurantes Populares de Joinville, cobrindo as 7 fases do projeto.

## Requisitos
- Docker e Docker Compose instalados.

## Como rodar o projeto
1. Na raiz do projeto, execute o comando:
   `docker-compose up -d --build`
2. O Banco de Dados PostgreSQL subirá na porta 5432 (O script `database/init.sql` criará todas as tabelas).
3. O Backend (Node.js) estará disponível em `http://localhost:3001`.
4. O Frontend (React) estará disponível em `http://localhost:80`.
