import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Captura erros de renderização em qualquer tela filha e mostra um card de
 * recuperação — em vez de deixar o React desmontar a árvore inteira (o que
 * causava o efeito "a tela pisca e some").
 *
 * `resetKey`: quando muda, o boundary volta ao estado normal automaticamente
 * (ex.: ao trocar de tela). Assim um erro numa análise não trava as próximas.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error('[ErrorBoundary] Erro de renderização capturado:', erro, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.erro) {
      this.setState({ erro: null });
    }
  }

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="min-h-screen bg-noir flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-ink-800/70 rounded-2xl border border-line p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={26} className="text-red-400" />
          </div>
          <h1 className="text-lg font-bold text-parchment">Algo deu errado ao exibir esta tela</h1>
          <p className="text-sm text-parchment/50 mt-2">
            O erro foi registrado. Você pode voltar e tentar novamente sem perder o acesso ao sistema.
          </p>
          <pre className="mt-4 text-left text-xs text-parchment/40 bg-ink-900 rounded-lg p-3 overflow-x-auto">
            {String(this.state.erro?.message || this.state.erro)}
          </pre>
          <button
            onClick={() => {
              this.setState({ erro: null });
              this.props.onReset?.();
            }}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-gold hover:bg-gold-soft text-ink text-sm font-semibold rounded-xl transition-colors"
          >
            <RotateCcw size={16} />
            Voltar ao início
          </button>
        </div>
      </div>
    );
  }
}
