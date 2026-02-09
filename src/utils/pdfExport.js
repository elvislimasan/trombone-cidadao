import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/customSupabaseClient';

export const exportPetitionPDF = async (petition, toast) => {
    try {
      toast({ title: "Gerando PDF...", description: "Aguarde enquanto preparamos o documento." });
      
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.text(petition.title, 14, 22);
      
      // Meta info
      doc.setFontSize(10);
      doc.text(`Criado em: ${new Date(petition.created_at).toLocaleDateString('pt-BR')}`, 14, 32);
      doc.text(`Assinaturas: ${petition.signatureCount}`, 14, 36);
      doc.text(`Meta: ${petition.goal}`, 14, 40);
      
      // Description (truncated if too long)
      const splitDescription = doc.splitTextToSize(petition.description || '', 180);
      doc.text(splitDescription.slice(0, 5), 14, 50);
      
      // Signatures Table
      toast({ title: "Buscando assinaturas...", description: "Isso pode levar alguns segundos." });
      
      const { data: allSignatures, error } = await supabase
        .from('signatures')
        .select('name, city, created_at, comment')
        .eq('petition_id', petition.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const tableData = allSignatures.map(sig => [
        sig.name || 'Anônimo',
        sig.city || '-',
        new Date(sig.created_at).toLocaleDateString('pt-BR'),
        sig.comment || '-'
      ]);
      
      autoTable(doc, {
        head: [['Nome', 'Cidade', 'Data', 'Comentário']],
        body: tableData,
        startY: 70,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [22, 163, 74] }
      });
      
      doc.save(`abaixo-assinado-${petition.id}.pdf`);
      
      toast({ title: "Sucesso!", description: "Download iniciado." });
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast({ title: "Erro", description: "Falha ao gerar o PDF.", variant: "destructive" });
    }
};
