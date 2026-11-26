// Pastas usadas pela coleta. Tudo que contém dados de pessoas (dados/, saida/,
// .cache/) fica fora do git — ver prospeccao/.gitignore.
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const PASTA_DADOS = path.join(RAIZ, 'dados')
export const PASTA_FONTES = path.join(PASTA_DADOS, 'fontes') // um .jsonl por fonte
export const PASTA_BRUTOS = path.join(PASTA_DADOS, 'brutos') // downloads (ex.: CNPJ da Receita)
export const PASTA_ENTRADA = path.join(PASTA_DADOS, 'entrada') // CSVs manuais / pesquisa web
export const PASTA_SAIDA = path.join(RAIZ, 'saida')
export const PASTA_CONFIG = path.join(RAIZ, 'config')
