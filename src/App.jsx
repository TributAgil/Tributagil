import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { salvarAnalise } from './lib/analises';
import Login from './pages/Login';
import NovaAnalise from './pages/NovaAnalise';
import CerebroTributario from './pages/CerebroTributario';
import ResultadoAnalise from './pages/ResultadoAnalise';
import Historico from './pages/Historico';
import BotaoSuporteFlutuante from './components/BotaoSuporteFlutuante';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [telaAtual, setTelaAtual] = useState('login');
  const [payloadAnalise, setPayloadAnalise] = useState(null);
  const [analiseSelecionada, setAnaliseSelecionada] = useState(null);

  useEffect(() => {
    let subscription;

    // 1. Recupera a sessão atual (se houver) de forma resiliente a falha de rede.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user);
          setTelaAtual('historico');
        }
      })
      .catch((err) => {
        console.error('[Auth] Falha ao recuperar a sessão:', err);
      })
      .finally(() => setLoading(false));

    // 2. Escuta mudanças de autenticação.
    //    IMPORTANTE: só forçamos a volta ao login num SIGNED_OUT explícito.
    //    Antes, qualquer evento com sessão nula (INITIAL_SESSION, TOKEN_REFRESHED
    //    transitório) jogava o usuário para o login no meio de outra tela —
    //    era uma das causas da "tela que pisca e some".
    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          setUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setTelaAtual('login');
        }
      });
      subscription = data?.subscription;
    } catch (err) {
      console.error('[Auth] Não foi possível registrar o listener de autenticação:', err);
    }

    return () => {
      try {
        subscription?.unsubscribe();
      } catch {
        /* listener já removido */
      }
    };
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setTelaAtual('historico');
  };

  const handleIniciarAnalise = (payload) => {
    setPayloadAnalise(payload);
    setAnaliseSelecionada(null);
    setTelaAtual('processando');
  };

  // Recebe o resultado real devolvido pela IA e avança para a tela de resultado.
  const handleConcluirProcessamento = (resultadoRealDaIA) => {
    setAnaliseSelecionada(resultadoRealDaIA);
    setTelaAtual('resultado');

    // Persiste no histórico em segundo plano (best-effort — não bloqueia a UI).
    salvarAnalise({
      userId: user?.id,
      payload: payloadAnalise,
      resultado: resultadoRealDaIA,
    }).catch((err) => console.error('[App] Falha ao salvar no histórico:', err));
  };

  const handleNovaAnalise = () => {
    setPayloadAnalise(null);
    setAnaliseSelecionada(null);
    setTelaAtual('analise');
  };

  const handleVerHistorico = () => setTelaAtual('historico');

  const handleReabrirAnalise = (analise) => {
    // Aceita tanto o objeto de resultado direto quanto o registro do histórico.
    setAnaliseSelecionada(analise?.resultado ?? analise);
    setTelaAtual('resultado');
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Auth] Falha ao sair:', err);
    } finally {
      // Garante a volta ao login mesmo se o signOut falhar (rede, etc.).
      setUser(null);
      setPayloadAnalise(null);
      setAnaliseSelecionada(null);
      setTelaAtual('login');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400">Carregando TributÁgil...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary resetKey={telaAtual} onReset={() => setTelaAtual(user ? 'historico' : 'login')}>
      {telaAtual === 'login' && <Login onLoginSuccess={handleLoginSuccess} />}

      {telaAtual === 'historico' && (
        <Historico
          user={user}
          onNovaAnalise={handleNovaAnalise}
          onReabrirAnalise={handleReabrirAnalise}
          onLogout={handleLogout}
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
    </ErrorBoundary>
  );
}
