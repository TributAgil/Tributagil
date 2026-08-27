import { useState } from 'react';
import { analisarDocumentoTributario } from '../lib/aiService';

export function useAnaliseTributaria() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const executarAnalise = async (dadosTexto: string) => {
    try {
      setLoading(true);
      setErro(null);
      const resposta = await analisarDocumentoTributario(dadosTexto);
      setResultado(resposta);
    } catch (err: any) {
      setErro(err.message || 'Erro ao processar análise.');
    } finally {
      setLoading(false);
    }
  };

  return { executarAnalise, resultado, loading, erro };
}