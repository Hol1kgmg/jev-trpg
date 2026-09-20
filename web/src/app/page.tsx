// サーバー側でだけ読める JEV_STUB を、AI 稼働状態としてクライアントに渡す
import Game from './game';

export default function Page() {
  return <Game aiActive={process.env.JEV_STUB !== '1'} />;
}
