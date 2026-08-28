import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { salvarAnalise, caminhosDocumentos } from './lib/analises';
import { removerDocumentos } from './lib/storageDocumentos';
import Login from './pages/Login';
import Painel from './pages/Painel';
import NovaAnalise from './pages/NovaAnalise';
import CerebroTributario from './pages/CerebroTributario';
import ResultadoAnalise from './pages/ResultadoAnalise';
import Historico from './pages/Historico';
import RedefinirSenha from './pages/RedefinirSenha';
import BotaoSuporteFlutuante from './components/BotaoSuporteFlutuante';
import ErrorBoundary from './components/ErrorBoundary';

// O link de recuperação de senha do Supabase chega como
// https://app/#access_token=...&type=recovery&...
const chegouPorRecuperacao = () =>
  typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [telaAtual, setTelaAtual] = useState(
    chegouPorRecuperacao() ? 'redefinir-senha' : 'login',
  );
  const [payloadAnalise, setPayloadAnalise] = useState(null);
  const [analiseSelecionada, setAnaliseSelecionada] = useState(null);

  useEffect(() => {
    let subscription;
    const emRecuperacao = chegouPorRecuperacao();

    // 1. Recupera a sessão atual (se houver) de forma resiliente a falha de rede.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user);
          // Se o usuário chegou pelo link de recuperação, NÃO manda para o painel:
          // ele precisa definir a nova senha primeiro.
          if (!emRecuperacao) setTelaAtual('painel');
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
        if (event === 'PASSWORD_RECOVERY') {
          setUser(session?.user ?? null);
          setTelaAtual('redefinir-senha');
          return;
        }
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
    setTelaAtual('painel');
  };

  const handleIniciarAnalise = (payload) => {
    setPayloadAnalise(payload);
    setAnaliseSelecionada(null);
    setTelaAtual('processando');
  };

  // Recebe o resultado real devolvido pela IA, salva no histórico e avança.
  const handleConcluirProcessamento = async (resultadoRealDaIA) => {
    // 1. Mostra o resultado imediatamente — não depende do save.
    setAnaliseSelecionada(resultadoRealDaIA);
    setTelaAtual('resultado');

    // 2. Persiste no histórico. Aguardamos para garantir que a linha exista
    //    antes de o usuário navegar para o Histórico/Painel.
    let salvo = null;
    try {
      salvo = await salvarAnalise({
        userId: user?.id,
        payload: payloadAnalise,
        resultado: resultadoRealDaIA,
      });
      if (salvo) {
        console.info('[App] Análise salva no histórico:', salvo.id);
      } else {
        console.warn('[App] Análise NÃO foi salva no histórico (ver logs de [analises]).');
      }
    } catch (err) {
      console.error('[App] Erro ao salvar no histórico:', err);
    }

    // 3. LGPD / minimização: com o parecer já persistido, os documentos-fonte
    //    não precisam mais ficar no Storage. Só apaga se o registro foi salvo
    //    (senão perderíamos o único vestígio da análise).
    if (salvo) {
      const caminhos = caminhosDocumentos(payloadAnalise);
      if (caminhos.length > 0) {
        removerDocumentos(caminhos).catch((err) =>
          console.warn('[App] Falha ao limpar documentos do Storage:', err),
        );
      }
    }
  };

  const handleNovaAnalise = () => {
    setPayloadAnalise(null);
    setAnaliseSelecionada(null);
    setTelaAtual('analise');
  };

  // A análise falhou/foi sinalizada como dados insuficientes: o usuário volta
  // para uma tela de upload NOVA (outro analise_id), então os documentos já
  // enviados ficam órfãos — apaga do Storage para não acumular PII.
  const handleErroProcessamento = () => {
    const caminhos = caminhosDocumentos(payloadAnalise);
    if (caminhos.length > 0) {
      removerDocumentos(caminhos).catch((err) =>
        console.warn('[App] Falha ao limpar documentos órfãos:', err),
      );
    }
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

  // Após redefinir a senha: limpa o hash da URL, encerra a sessão de
  // recuperação e volta ao login para o usuário entrar com a nova senha.
  const handleRedefinicaoConcluida = async () => {
    try {
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Auth] Falha ao encerrar sessão de recuperação:', err);
    } finally {
      setUser(null);
      setTelaAtual('login');
    }
  };

  if (loading) {
    return (
      <div className="bg-noir min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-parchment/40 font-sans">Carregando TributÁgil...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary resetKey={telaAtual} onReset={() => setTelaAtual(user ? 'painel' : 'login')}>
      {telaAtual === 'redefinir-senha' && (
        <RedefinirSenha onConcluido={handleRedefinicaoConcluida} />
      )}

      {telaAtual === 'login' && <Login onLoginSuccess={handleLoginSuccess} />}

      {telaAtual === 'painel' && (
        <Painel
          user={user}
          onNovaAnalise={handleNovaAnalise}
          onReabrirAnalise={handleReabrirAnalise}
          onVerHistorico={handleVerHistorico}
          onLogout={handleLogout}
        />
      )}

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
          onErro={handleErroProcessamento}
        />
      )}

      {telaAtual === 'resultado' && (
        <ResultadoAnalise
          analise={analiseSelecionada}
          onVoltar={handleVerHistorico}
          onNovaAnalise={handleNovaAnalise}
        />
      )}

      {telaAtual !== 'login' && telaAtual !== 'redefinir-senha' && <BotaoSuporteFlutuante />}
    </ErrorBoundary>
  );
}
