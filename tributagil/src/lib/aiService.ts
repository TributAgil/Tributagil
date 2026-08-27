import { GoogleGenAI } from '@google/genai';

// Inicializa o cliente do Gemini usando a variável de ambiente com segurança de tipos
const importMeta = import.meta as any;
const apiKey = importMeta.env.VITE_GEMINI_API_KEY as string;

if (!apiKey) {
  console.warn('Aviso: Chave da API do Gemini não configurada no .env');
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

/**
 * Função para analisar documentos ou textos jurídicos/tributários
 * @param prompt O texto ou instrução detalhada para a IA processar
 */
export async function analisarDocumentoTributario(prompt: string): Promise<string> {
  try {
    // Usando o modelo gemini-3.1-flash-lite para respostas rápidas e eficientes
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        temperature: 0.2, // Baixa temperatura para respostas mais objetivas e precisas em direito tributário
      }
    });

    return response.text || 'Nenhuma resposta gerada pela IA.';
  } catch (error) {
    console.error('Erro ao chamar a API do Gemini:', error);
    throw new Error('Falha ao processar a análise com a Inteligência Artificial.');
  }
}