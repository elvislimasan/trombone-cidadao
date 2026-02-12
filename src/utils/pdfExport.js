import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/customSupabaseClient';

export const exportPetitionPDF = async (petition, toast) => {
    try {
      toast({ title: "Gerando PDF...", description: "Aguarde enquanto preparamos o documento." });
      
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(18);
      const splitTitle = doc.splitTextToSize(petition.title, 180);
      doc.text(splitTitle, 14, 22);
      
      // Position for Meta info (dynamic based on title length)
      let currentY = 22 + (splitTitle.length * 8);
      
      // Meta info
      doc.setFontSize(10);
      doc.text(`Criado em: ${new Date(petition.created_at).toLocaleDateString('pt-BR')}`, 14, currentY);
      doc.text(`Assinaturas: ${petition.signatureCount || 0}`, 14, currentY + 5);
      doc.text(`Meta: ${petition.goal || 0}`, 14, currentY + 10);
      
      currentY += 20;

      // Description
      if (petition.description) {
        doc.setFontSize(11);
        const splitDescription = doc.splitTextToSize(petition.description, 180);
        // Show the whole description (it will overflow to next page if too long, 
        // but for now let's just make it wrap and not cut off horizontally)
        doc.text(splitDescription, 14, currentY);
        currentY += (splitDescription.length * 6) + 10;
      }
      
      // Signatures Table
      toast({ title: "Buscando assinaturas...", description: "Isso pode levar alguns segundos." });
      
      const { data: allSignatures, error } = await supabase
        .from('signatures')
        .select('name, email, city, created_at, comment')
        .eq('petition_id', petition.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const tableData = allSignatures.map(sig => [
        sig.name || 'Anônimo',
        sig.email || '-',
        sig.city || '-',
        new Date(sig.created_at).toLocaleDateString('pt-BR'),
        sig.comment || '-'
      ]);
      
      autoTable(doc, {
        head: [['Nome', 'Email', 'Cidade', 'Data', 'Comentário']],
        body: tableData,
        startY: currentY,
        styles: { fontSize: 8, overflow: 'linebreak' },
        columnStyles: {
          1: { cellWidth: 40 }, // Email
          4: { cellWidth: 'auto' } // Comment
        },
        headStyles: { fillColor: [22, 163, 74] }
      });
      
      doc.save(`abaixo-assinado-${petition.id}.pdf`);
      
      toast({ title: "Sucesso!", description: "Download iniciado." });
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast({ title: "Erro", description: "Falha ao gerar o PDF.", variant: "destructive" });
    }
};
