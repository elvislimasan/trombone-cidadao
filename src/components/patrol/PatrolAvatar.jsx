import { patrolAvatarHtml } from './patrolAvatarMarkup';

// O avatar do mapa, em React.
//
// Desenho, peças e animação moram em `./avatar` e no index.css — este
// componente existe para as telas de preparação mostrarem o mesmo boneco que
// vai aparecer no mapa, montado a partir da mesma configuração. Ver o
// comentário de lá para o porquê de a marcação ser uma string.
//
// A CÂMERA PADRÃO AQUI É A DE FRENTE
//
// Quem usa este componente são as telas em que se ESCOLHE a aparência, e ali a
// pessoa precisa ver o rosto — é o que ela está decidindo. O mapa não passa por
// aqui: ele monta a marcação direto e pede `camera: 'costas'`.

export default function PatrolAvatar({
  modo,
  avatar,
  camera = 'frente',
  emMovimento = true,
  gpsAtivo = true,
  tamanho = 56,
  sobreMarca = false,
  className = '',
  rotulo = null,
}) {
  const classes = [sobreMarca ? 'patrol-avatar--on-brand' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className="inline-flex"
      style={{ '--patrol-avatar-size': `${tamanho}px` }}
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo || undefined}
      aria-hidden={rotulo ? undefined : true}
      // A marcação é montada pelo próprio app a partir de uma configuração
      // normalizada: nada aqui vem cru de usuário, URL ou banco.
      dangerouslySetInnerHTML={{
        __html: patrolAvatarHtml(modo, { avatar, camera, emMovimento, gpsAtivo, className: classes }),
      }}
    />
  );
}
