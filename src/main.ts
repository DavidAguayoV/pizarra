import './styles.css';
import { aplicarTema, temaActual } from './core/tema';
import { montarApp } from './ui/app';

aplicarTema(temaActual(), false); // sin guardar: seguir al sistema hasta que se elija otro
const raiz = document.getElementById('app');
if (!raiz) throw new Error('Falta el contenedor #app');
montarApp(raiz);
