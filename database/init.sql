-- FASE 1 A 7: BANCO DE DADOS COMPLETO ERP JOINVILLE
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- UNIDADES
CREATE TABLE unidade_restaurante (
    id_unidade SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    bairro VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'ATIVO'
);

-- USUARIOS E ACESSO
CREATE TABLE perfil (
    id_perfil SERIAL PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE usuario (
    id_usuario UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    id_perfil INT REFERENCES perfil(id_perfil),
    status VARCHAR(20) DEFAULT 'ATIVO'
);

CREATE TABLE usuario_unidade (
    id_usuario UUID REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    id_unidade INT REFERENCES unidade_restaurante(id_unidade) ON DELETE CASCADE,
    PRIMARY KEY (id_usuario, id_unidade)
);

-- CADASTROS ESTOQUE
CREATE TABLE unidade_medida (
    id_unidade_medida SERIAL PRIMARY KEY,
    sigla VARCHAR(10) NOT NULL,
    descricao VARCHAR(50) NOT NULL,
    grandeza VARCHAR(20) NOT NULL
);

CREATE TABLE categoria (
    id_categoria SERIAL PRIMARY KEY,
    descricao VARCHAR(100) NOT NULL,
    tipo_item VARCHAR(50) NOT NULL
);

CREATE TABLE produto (
    id_produto SERIAL PRIMARY KEY,
    descricao VARCHAR(150) NOT NULL UNIQUE,
    id_unidade_medida INT REFERENCES unidade_medida(id_unidade_medida),
    id_categoria INT REFERENCES categoria(id_categoria),
    perecivel BOOLEAN DEFAULT TRUE,
    fator_correcao DECIMAL(10,4) DEFAULT 1.0000
);

CREATE TABLE fornecedor (
    id_fornecedor SERIAL PRIMARY KEY,
    razao_social VARCHAR(150) NOT NULL,
    cnpj_cpf VARCHAR(20) UNIQUE
);

-- ESTOQUE E MOVIMENTACAO
CREATE TABLE lote (
    id_lote SERIAL PRIMARY KEY,
    id_produto INT REFERENCES produto(id_produto),
    data_validade DATE,
    valor_unitario DECIMAL(10,4) NOT NULL
);

CREATE TABLE movimento_estoque (
    id_movimento SERIAL PRIMARY KEY,
    id_unidade_restaurante INT REFERENCES unidade_restaurante(id_unidade),
    id_lote INT REFERENCES lote(id_lote),
    tipo_movimento VARCHAR(50) NOT NULL,
    quantidade DECIMAL(10,4) NOT NULL,
    data_movimento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'APROVADA'
);

-- CARDAPIO
CREATE TABLE prato (
    id_prato SERIAL PRIMARY KEY,
    descricao_prato VARCHAR(150) NOT NULL,
    rendimento_porcoes INT NOT NULL
);

-- COTACAO
CREATE TABLE cotacao (
    id_cotacao SERIAL PRIMARY KEY,
    id_fornecedor INT REFERENCES fornecedor(id_fornecedor),
    id_produto INT REFERENCES produto(id_produto),
    mes_referencia VARCHAR(7) NOT NULL,
    preco DECIMAL(10,4) NOT NULL
);

-- ATENDIMENTO
CREATE TABLE refeicao_servida (
    id_refeicao_servida SERIAL PRIMARY KEY,
    id_unidade_restaurante INT REFERENCES unidade_restaurante(id_unidade),
    tipo_refeicao VARCHAR(50) NOT NULL,
    categoria_tarifaria VARCHAR(50) NOT NULL,
    valor_cobrado DECIMAL(10,2) DEFAULT 0.00
);

-- AUDITORIA
CREATE TABLE auditoria (
    id_auditoria SERIAL PRIMARY KEY,
    id_usuario UUID REFERENCES usuario(id_usuario),
    acao VARCHAR(50) NOT NULL,
    tabela_afetada VARCHAR(50) NOT NULL
);
