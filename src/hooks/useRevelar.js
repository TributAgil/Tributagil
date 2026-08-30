import { useEffect, useRef } from 'react';

/**
 * Revela em cascata os elementos `.reveal` / `.reveal-x` dentro de um
 * container, conforme eles entram na tela.
 *
 * Por que IntersectionObserver e não animar tudo na montagem: o parecer é
 * longo. Animar de uma vez faria o conteúdo abaixo da dobra terminar a
 * animação sem ninguém ver — e, pior, o usuário rolaria para uma área já
 * "gasta". Assim cada bloco entra no momento em que é lido.
 *
 * O escalonamento (o atraso entre irmãos) vem do CSS, via `--i` que o
 * componente define inline em cada filho — ver `[data-stagger]` no index.css.
 *
 * @param {Array} deps quando mudar, re-observa (ex.: troca de aba).
 * @returns {React.RefObject} ref para o container.
 */
export function useRevelar(deps = []) {
  const ref = useRef(null);

  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return undefined;

    const alvos = raiz.querySelectorAll('.reveal, .reveal-x');
    if (alvos.length === 0) return undefined;

    // Sem suporte (navegador antigo, ambiente de teste): mostra tudo. Nunca
    // deixamos conteúdo invisível por falta de API de animação.
    if (typeof IntersectionObserver === 'undefined') {
      alvos.forEach((el) => el.classList.add('is-in'));
      return undefined;
    }

    alvos.forEach((el) => el.classList.remove('is-in'));

    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;
          entrada.target.classList.add('is-in');
          observador.unobserve(entrada.target); // revela uma vez só
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.04 },
    );

    alvos.forEach((el) => observador.observe(el));
    return () => observador.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

export default useRevelar;
