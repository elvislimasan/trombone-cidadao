/** Vincula uma duplicata pela operação atômica e auditável do banco. */
export const linkDuplicateReport = async (supabase, sourceReportId, targetReportId) => {
  const { data, error } = await supabase.rpc('link_duplicate_report', {
    p_source_report_id: sourceReportId,
    p_target_report_id: targetReportId,
  });
  if (error) throw error;
  if (data !== true) throw new Error('A bronca não foi alterada. Tente novamente.');
  return true;
};
