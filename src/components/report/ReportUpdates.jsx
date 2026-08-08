import { Link } from "react-router-dom";
import { Megaphone, CheckCircle, Trash2 } from "lucide-react";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 2 da fase 2).
// Timeline de atualizacoes da comunidade: enviar, confirmar e excluir.
// canConfirmUpdate/canDeleteUpdate vem de useReportPermissions (task 1) —
// este componente nao calcula permissao por conta propria.
const ReportUpdates = ({
  user,
  isAdmin,
  visibleUpdates,
  showAllUpdates,
  setShowAllUpdates,
  canSendAnyUpdate,
  nextAvailableLabel,
  setShowUpdateModal,
  UPDATES_VISIBLE_COUNT,
  confirmingUpdateId,
  setConfirmingUpdateId,
  deletingUpdateId,
  setDeletingUpdateId,
  canConfirmUpdate,
  canDeleteUpdate,
  handleConfirmUpdate,
  handleDeleteUpdate,
  getUpdateTypeInfo,
  getStatusInfo,
  formatRelativeDate,
  formatDateTime,
  setUpdateMediaViewer,
}) => {
  return (
    <div className="bg-[#f2f4f7] rounded-2xl px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <Megaphone className="w-3.5 h-3.5 text-[#9f3f3b]" strokeWidth={1.5} />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#9f3f3b]">
            Atualizações
          </h2>
          {visibleUpdates.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-white font-semibold text-[#6b7280]">
              {visibleUpdates.length}
            </span>
          )}
        </div>

        {/* Send button or rate-limit info */}
        {user ? (
          canSendAnyUpdate ? (
            <button
              type="button"
              onClick={() => setShowUpdateModal(true)}
              className="text-[11px] font-semibold text-[#b61722] hover:underline"
            >
              + Enviar atualização
            </button>
          ) : (
            <span className="text-[10px] text-[#9b9fa3]">
              disponível {nextAvailableLabel}
            </span>
          )
        ) : null}
      </div>

      {/* Update list */}
      {visibleUpdates.length === 0 ? (
        <div className="py-3 flex items-center gap-3">
          <p className="text-xs text-[#9b9fa3] flex-1">
            Esteve no local? Informe o status atual.
          </p>
          {/* Usuário logado já tem o botão "+ Enviar atualização" no header acima;
              aqui mostramos apenas o atalho de login para quem está deslogado. */}
          {!user && (
            <Link
              to="/login"
              className="text-[11px] font-semibold text-[#b61722] hover:underline whitespace-nowrap"
            >
              Fazer login
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {(showAllUpdates
              ? visibleUpdates
              : visibleUpdates.slice(0, UPDATES_VISIBLE_COUNT)
            ).map((upd) => {
              const typeInfo = getUpdateTypeInfo(upd.update_type);
              const TypeIcon = typeInfo.Icon;
              const isOwnPending =
                upd.status === "pending" && upd.author_id === user?.id;
              const isPendingModeration = upd.status === "pending_moderation";
              const isRejected = upd.status === "rejected";
              const canConfirm = canConfirmUpdate(upd);
              const isConfirming = confirmingUpdateId === upd.id;
              const isDeleting = deletingUpdateId === upd.id;
              const canDelete = canDeleteUpdate(upd);
              const confirmStatusText = getStatusInfo(
                upd.update_type === "solved" && isAdmin
                  ? "resolved"
                  : typeInfo.reportStatus
              ).text;
              return (
                <div key={upd.id} className={`rounded-2xl border overflow-hidden ${typeInfo.cardBorder} ${typeInfo.cardBg}`}>

                  {/* Main row */}
                  <div className="flex items-start gap-3 px-3.5 pt-3 pb-3">
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl ${typeInfo.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <TypeIcon className={`w-4.5 h-4.5 ${typeInfo.color}`} strokeWidth={2.5} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-[13px] font-bold leading-tight ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        {upd.status === "confirmed" && (
                          <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" strokeWidth={2.5} />
                            Confirmada
                          </span>
                        )}
                        {isPendingModeration && (
                          <span className="flex-shrink-0 text-[10px] font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                            Em moderação
                          </span>
                        )}
                        {isOwnPending && (
                          <span className="flex-shrink-0 text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            Aguardando
                          </span>
                        )}
                      </div>

                      {upd.message && (
                        <p className="text-xs text-[#374151] mt-1 leading-relaxed">
                          {upd.message}
                        </p>
                      )}

                      {/* Inline photo thumbnails — click to expand */}
                      {upd.media && upd.media.length > 0 && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {upd.media.slice(0, 4).map((m, idx) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                setUpdateMediaViewer({
                                  isOpen: true,
                                  media: upd.media.map((mm) => ({ ...mm, url: mm.url, type: 'image' })),
                                  startIndex: idx,
                                })
                              }
                              className="relative flex-shrink-0 hover:opacity-90 transition-opacity"
                            >
                              <img
                                src={m.url}
                                alt=""
                                className="w-20 h-20 rounded-xl object-cover"
                                loading="lazy"
                              />
                              {idx === 3 && upd.media.length > 4 && (
                                <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">+{upd.media.length - 4}</span>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Autor + data */}
                      <div className="mt-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-[#6b7280]">
                            {upd.author?.name || "Usuário"}
                          </span>
                          <span className="text-[10px] text-[#9b9fa3] ml-1">
                            · {formatRelativeDate(upd.created_at)}
                          </span>
                          <span className="text-[10px] text-[#b0b5bc] ml-1 hidden sm:inline">
                            · {formatDateTime(upd.created_at).replace(",", " às")}
                          </span>
                          {/* data completa em linha própria no mobile */}
                          <div className="text-[10px] text-[#b0b5bc] sm:hidden">
                            {formatDateTime(upd.created_at).replace(",", " às")}
                          </div>
                        </div>

                        {/* Ações: confirmar ou excluir — nunca os dois ao mesmo tempo */}
                        {!isDeleting && canConfirm && !isConfirming && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => { setConfirmingUpdateId(null); setDeletingUpdateId(upd.id); }}
                                className="p-1 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                                title="Excluir atualização"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmingUpdateId(upd.id)}
                              className={`text-[11px] font-bold ${typeInfo.color} underline underline-offset-2 hover:opacity-70 transition-opacity`}
                            >
                              Confirmar →
                            </button>
                          </div>
                        )}
                        {!isDeleting && canDelete && !canConfirm && !isConfirming && (
                          <button
                            type="button"
                            onClick={() => setDeletingUpdateId(upd.id)}
                            className="flex-shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                            title="Excluir atualização"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}

                        {/* Confirmação de exclusão inline */}
                        {isDeleting && (
                          <div className="flex-shrink-0 flex flex-col items-end gap-1">
                            <span className="text-[10px] text-[#6b7280] text-right">Excluir esta atualização?</span>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setDeletingUpdateId(null)} className="text-[10px] text-[#9b9fa3]">
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => { setDeletingUpdateId(null); handleDeleteUpdate(upd); }}
                                className="text-[10px] font-bold text-white bg-red-500 px-2.5 py-1 rounded-full"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Confirmação de confirmação inline */}
                        {canConfirm && isConfirming && (
                          <div className="flex-shrink-0 flex flex-col items-end gap-1">
                            <span className="text-[10px] text-[#6b7280] text-right">
                              Muda para <strong>"{confirmStatusText}"</strong>
                            </span>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setConfirmingUpdateId(null)} className="text-[10px] text-[#9b9fa3]">
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => { setConfirmingUpdateId(null); handleConfirmUpdate(upd); }}
                                className="text-[10px] font-bold text-white bg-[#b61722] px-2.5 py-1 rounded-full"
                              >
                                Confirmar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expand / collapse */}
          {visibleUpdates.length > UPDATES_VISIBLE_COUNT && (
            <button
              type="button"
              onClick={() => setShowAllUpdates((v) => !v)}
              className="mt-2 w-full text-center text-[11px] font-semibold text-[#6b7280] hover:text-[#191c1e] py-1.5 border-t border-gray-200 transition-colors"
            >
              {showAllUpdates
                ? "Ver menos"
                : `Ver mais ${visibleUpdates.length - UPDATES_VISIBLE_COUNT} atualização${
                    visibleUpdates.length - UPDATES_VISIBLE_COUNT > 1 ? "s" : ""
                  }`}
            </button>
          )}

          {/* Login prompt for guests */}
          {!user && (
            <p className="mt-3 pt-3 border-t border-gray-200 text-center text-[11px] text-[#9b9fa3]">
              <Link to="/login" className="font-semibold text-[#b61722] hover:underline">
                Faça login
              </Link>{" "}
              para enviar uma atualização
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default ReportUpdates;
