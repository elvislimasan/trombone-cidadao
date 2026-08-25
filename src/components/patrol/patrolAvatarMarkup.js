// O desenho do avatar mudou de endereço.
//
// Ele era um arquivo só. Com duas câmeras — de costas no mapa, de frente nas
// telas de escolha — passaria de mil linhas, e uma peça errada no meio disso
// não seria achada por ninguém. Agora cada parte mora no seu arquivo, em
// `./avatar`: a paleta que todas dividem, o corpo, a cabeça, a carga e o
// veículo.
//
// Este arquivo continua existindo porque dois lugares importam daqui — o
// `MapView` e o `PatrolAvatar` — e não há motivo para que uma reorganização
// interna do desenho apareça na porta deles.

export { patrolAvatarHtml, PATROL_AVATAR_FRAME } from './avatar';
