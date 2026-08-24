import { Link } from "react-router-dom";
import { CheckCircle, Trash2 } from "lucide-react";
import Icon from "@/design-system/icons";

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 2 da fase 2).
// Timeline de atualizacoes da comunidade: enviar, confirmar e excluir.
// canConfirmUpdate/canDeleteUpdate vem de useReportPermissions (task 1) —
// este componente nao calcula permissao por conta propria.
// Redesenhado na task 5 da fase 2: bloco de icone trombone em surface-subtle
// (padrao unico) em vez das cores por update_type (still_here/being_solved/
// solved) que vinham de getUpdateTypeInfo em ReportPage.jsx -- so usamos dali
// o texto (label), o icone semantico (Icon, lucide) e o status associado
// (reportStatus), nao mais as classes de cor (color/cardBg/cardBorder/
// iconBg), pra manter vermelho restrito a acao/estado ativo como pede o
// design novo.
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
    <div className="bg-surface-raised border border-edge-subtle rounded-2xl px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <Icon name="trombone" size={14} className="text-brand" />
          <h2 className="text-xs font-bold text-content-primary">
            Atualizações
          </h2>
          {visibleUpdates.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-2xs bg-surface-subtle font-semibold text-content-tertiary">
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
              className="text-2xs font-semibold text-brand hover:underline"
            >
              + Enviar atualização
            </button>
          ) : (
            <span className="text-2xs text-content-tertiary">
              disponível {nextAvailableLabel}
            </span>
          )
        ) : null}
      </div>

      {/* Update list */}
      {visibleUpdates.length === 0 ? (
        <div className="py-3 flex items-center gap-3">
          <p className="text-xs text-content-tertiary flex-1">
            Esteve no local? Informe o status atual.
          </p>
          {/* Usuário logado já tem o botão "+ Enviar atualização" no header acima;
              aqui mostramos apenas o atalho de login para quem está deslogado. */}
          {!user && (
            <Link
              to="/login"
              className="text-2xs font-semibold text-brand hover:underline whitespace-nowrap"
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
                <div key={upd.id} className="rounded-2xl border border-edge-subtle bg-surface-raised overflow-hidden">

                  {/* Main row */}
                  <div className="flex items-start gap-3 px-3.5 pt-3 pb-3">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-xl bg-surface-subtle flex items-center justify-center flex-shrink-0">
                      <Icon name="trombone" size={16} className="text-brand" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[13px] font-bold leading-tight text-content-primary">
                          {typeInfo.label}
                        </span>
                        {upd.status === "confirmed" && (
                          <span className="flex-shrink-0 flex items-center gap-0.5 text-2xs font-bold text-success-fg bg-success-bg px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" strokeWidth={2.5} />
                            Confirmada
                          </span>
                        )}
                        {isPendingModeration && (
                          <span className="flex-shrink-0 text-2xs font-semibold text-status-pendingFg bg-status-pendingBg px-2 py-0.5 rounded-full">
                            Em moderação
                          </span>
                        )}
                        {isOwnPending && (
                          <span className="flex-shrink-0 text-2xs font-semibold text-status-pendingFg bg-status-pendingBg px-2 py-0.5 rounded-full">
                            Aguardando
                          </span>
                        )}
                      </div>

                      {upd.message && (
                        <p className="text-xs text-content-secondary mt-1 leading-relaxed">
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
                          <span className="text-2xs text-content-secondary">
                            {upd.author?.name || "Usuário"}
                          </span>
                          <span className="text-2xs text-content-tertiary ml-1">
                            · {formatRelativeDate(upd.created_at)}
                          </span>
                          <span className="text-2xs text-content-tertiary ml-1 hidden sm:inline">
                            · {formatDateTime(upd.created_at).replace(",", " às")}
                          </span>
                          {/* data completa em linha própria no mobile */}
                          <div className="text-2xs text-content-tertiary sm:hidden">
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
                                className="p-1 rounded-lg text-content-tertiary hover:text-brand hover:bg-surface-subtle transition-colors"
                                title="Excluir atualização"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmingUpdateId(upd.id)}
                              className="text-[11px] font-bold text-brand underline underline-offset-2 hover:opacity-70 transition-opacity"
                            >
                              Confirmar →
                            </button>
                          </div>
                        )}
                        {!isDeleting && canDelete && !canConfirm && !isConfirming && (
                          <button
                            type="button"
                            onClick={() => setDeletingUpdateId(upd.id)}
                            className="flex-shrink-0 p-1 rounded-lg text-content-tertiary hover:text-brand hover:bg-surface-subtle transition-colors"
                            title="Excluir atualização"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}

                        {/* Confirmação de exclusão inline */}
                        {isDeleting && (
                          <div className="flex-shrink-0 flex flex-col items-end gap-1">
                            <span className="text-2xs text-content-secondary text-right">Excluir esta atualização?</span>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setDeletingUpdateId(null)} className="text-2xs text-content-tertiary">
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => { setDeletingUpdateId(null); handleDeleteUpdate(upd); }}
                                className="text-2xs font-bold text-content-onBrand bg-brand px-2.5 py-1 rounded-full"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Confirmação de confirmação inline */}
                        {canConfirm && isConfirming && (
                          <div className="flex-shrink-0 flex flex-col items-end gap-1">
                            <span className="text-2xs text-content-secondary text-right">
                              Muda para <strong>"{confirmStatusText}"</strong>
                            </span>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setConfirmingUpdateId(null)} className="text-2xs text-content-tertiary">
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => { setConfirmingUpdateId(null); handleConfirmUpdate(upd); }}
                                className="text-2xs font-bold text-content-onBrand bg-brand px-2.5 py-1 rounded-full"
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
              className="mt-2 w-full text-center text-[11px] font-semibold text-content-tertiary hover:text-content-primary py-1.5 border-t border-edge-subtle transition-colors"
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
            <p className="mt-3 pt-3 border-t border-edge-subtle text-center text-[11px] text-content-tertiary">
              <Link to="/login" className="font-semibold text-brand hover:underline">
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
