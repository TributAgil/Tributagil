import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase.ts';
import Login from './pages/Login';
import NovaAnalise from './pages/NovaAnalise';
import CerebroTributario from './pages/CerebroTributario';
import ResultadoAnalise from './pages/ResultadoAnalise';
import Historico from './pages/Historico';
import BotaoSuporteFlutuante from './components/BotaoSuporteFlutuante';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [telaAtual, setTelaAtual] = useState('login');
  const [payloadAnalise, setPayloadAnalise] = useState(null);
  const [analiseSelecionada, setAnaliseSelecionada] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setTelaAtual('historico');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (!currentUser) setTelaAtual('login');
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setTelaAtual('historico');
  };

  const handleIniciarAnalise = (payload) => {
    setPayloadAnalise(payload);
    setTelaAtual('processando');
  };

  // AJUSTADO PARA RECEBER O RESULTADO REAL DA IA
  const handleConcluirProcessamento = (resultadoRealDaIA) => {
    setAnaliseSelecionada(resultadoRealDaIA);
    setTelaAtual('resultado');
  };

  const handleNovaAnalise = () => {
    setPayloadAnalise(null);
    setAnaliseSelecionada(null);
    setTelaAtual('analise');
  };

  const handleVerHistorico = () => {
    setTelaAtual('historico');
  };

  const handleReabrirAnalise = (analise) => {
    setAnaliseSelecionada(analise);
    setTelaAtual('resultado');
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-pulse text-slate-400">Carregando TributÁgil...</div>
    </div>
  );

  return (
    <>
      {telaAtual === 'login' && <Login onLoginSuccess={handleLoginSuccess} />}
      
      {telaAtual === 'historico' && (
        <Historico
          user={user}
          onNovaAnalise={handleNovaAnalise}
          onReabrirAnalise={handleReabrirAnalise}
        />
      )}
      
      {telaAtual === 'analise' && (
        <NovaAnalise 
          user={user} 
          onIniciarAnalise={handleIniciarAnalise}
          onVoltar={handleVerHistorico}
        />
      )}
      
      {telaAtual === 'processando' && (
        <CerebroTributario
          payload={payloadAnalise}
          onConcluido={handleConcluirProcessamento}
          onErro={() => setTelaAtual('analise')}
        />
      )}
      
      {telaAtual === 'resultado' && (
        <ResultadoAnalise
          analise={analiseSelecionada}
          onVoltar={handleVerHistorico}
          onNovaAnalise={handleNovaAnalise}
        />
      )}

      {telaAtual !== 'login' && <BotaoSuporteFlutuante />}
    </>
  );
}