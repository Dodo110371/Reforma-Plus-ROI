/**
 * Módulo de Geração de Relatórios e Exportação
 * ReformaPlus ROI - PWA
 */

class ReportsManager {
  // Exportar dados de lançamentos para arquivo CSV
  static exportExpensesToCSV(expenses, propertyInfo) {
    if (!expenses || expenses.length === 0) {
      alert('Não há lançamentos para exportar em CSV.');
      return;
    }

    let csvContent = '\uFEFF'; // BOM UTF-8 para Excel reconhecer acentos corretamente
    csvContent += `Relatório de Custos da Reforma - ${propertyInfo.title}\n`;
    csvContent += `Gerado em: ${new Date().toLocaleDateString('pt-BR')}\n\n`;
    csvContent += 'Data;Tipo;Categoria;Ambiente;Fornecedor / Profissional;Descrição;Valor (R$);Status\n';

    expenses.forEach(exp => {
      const typeLabel = exp.type === 'material' ? 'Material' : exp.type === 'servico' ? 'Mão de Obra/Serviço' : exp.type === 'taxa' ? 'Taxa/Imposto' : 'Outros';
      const statusLabel = exp.status === 'pago' ? 'Pago' : 'Pendente';
      const cleanDesc = (exp.description || '').replace(/;/g, ',');
      const cleanSupplier = (exp.supplier || '').replace(/;/g, ',');

      csvContent += `${exp.date};${typeLabel};${exp.category};${exp.room};${cleanSupplier};${cleanDesc};${exp.amount.toFixed(2)};${statusLabel}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Relatorio_Reforma_${propertyInfo.title.replace(/\s+/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Renderizar o Relatório Completo Sintético e Analítico na aba de Relatórios
  static renderReportView(containerId, propertyInfo, expenses, metrics) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const todayStr = new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' });

    let html = `
      <div class="report-printable-sheet">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--accent-emerald); padding-bottom: 1rem; margin-bottom: 1.5rem;">
          <div>
            <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--text-main);">${propertyInfo.title}</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem;">Relatório Geral de Reforma e Margem de Revenda (Flip)</p>
          </div>
          <div style="text-align: right;">
            <span class="badge badge-pago" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">Status: Em Andamento</span>
            <p style="color: var(--text-dim); font-size: 0.8rem; margin-top: 0.3rem;">Data: ${todayStr}</p>
          </div>
        </div>

        <!-- Seção 1: Resumo Sintético Executivo -->
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: var(--accent-emerald);">1. Resumo Executivo Financeiro</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Valor da Aquisição</div>
            <div style="font-size: 1.2rem; font-weight: 700;">${MetricsManager.formatCurrency(metrics.purchasePrice)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Custo Total de Reforma</div>
            <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-cyan);">${MetricsManager.formatCurrency(metrics.totalRenovationCost)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Custos de Holding/Impostos</div>
            <div style="font-size: 1.2rem; font-weight: 700;">${MetricsManager.formatCurrency(metrics.holdingCosts)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Investimento Total</div>
            <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-gold);">${MetricsManager.formatCurrency(metrics.totalInvestment)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Venda Estimada</div>
            <div style="font-size: 1.2rem; font-weight: 700;">${MetricsManager.formatCurrency(metrics.estimatedResalePrice)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Lucro Líquido Estimado</div>
            <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-emerald);">${MetricsManager.formatCurrency(metrics.expectedNetProfit)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
            <div style="font-size: 0.8rem; color: var(--text-muted);">Retorno / ROI %</div>
            <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-emerald);">${MetricsManager.formatPercent(metrics.roiPercentage)}</div>
          </div>
        </div>

        <!-- Seção 2: Distribuição dos Insumos -->
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: var(--accent-emerald);">2. Distribuição por Insumos e Serviços</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm);">
            <div style="font-size: 0.85rem; color: var(--text-muted);">Materiais</div>
            <div style="font-size: 1.1rem; font-weight: 700;">${MetricsManager.formatCurrency(metrics.totalMaterials)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm);">
            <div style="font-size: 0.85rem; color: var(--text-muted);">Mão de Obra / Serviços</div>
            <div style="font-size: 1.1rem; font-weight: 700;">${MetricsManager.formatCurrency(metrics.totalServices)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm);">
            <div style="font-size: 0.85rem; color: var(--text-muted);">Taxas & Impostos</div>
            <div style="font-size: 1.1rem; font-weight: 700;">${MetricsManager.formatCurrency(metrics.totalTaxesFees)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm);">
            <div style="font-size: 0.85rem; color: var(--text-muted);">Total Pago</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--status-success);">${MetricsManager.formatCurrency(metrics.totalPaid)}</div>
          </div>
          <div style="background: var(--bg-surface); padding: 1rem; border-radius: var(--radius-sm);">
            <div style="font-size: 0.85rem; color: var(--text-muted);">Total Pendente</div>
            <div style="font-size: 1.1rem; font-weight: 700; color: var(--status-danger);">${MetricsManager.formatCurrency(metrics.totalPending)}</div>
          </div>
        </div>

        <!-- Seção 3: Relatório Analítico (Item por Item) -->
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: var(--accent-emerald);">3. Relatório Analítico Detalhado (${expenses.length} itens)</h3>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Categoria</th>
                <th>Ambiente</th>
                <th>Fornecedor / Profissional</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
    `;

    expenses.forEach(exp => {
      const typeBadgeClass = exp.type === 'material' ? 'badge-material' : exp.type === 'servico' ? 'badge-servico' : 'badge-taxa';
      const typeText = exp.type === 'material' ? 'Material' : exp.type === 'servico' ? 'Mão de Obra' : 'Taxa';
      const statusBadgeClass = exp.status === 'pago' ? 'badge-pago' : 'badge-pendente';
      const formattedDate = exp.date ? exp.date.split('-').reverse().join('/') : '-';

      html += `
        <tr>
          <td>${formattedDate}</td>
          <td><span class="badge ${typeBadgeClass}">${typeText}</span></td>
          <td>${exp.category}</td>
          <td>${exp.room}</td>
          <td><strong>${exp.supplier}</strong><br><small style="color: var(--text-dim);">${exp.description || ''}</small></td>
          <td><strong>${MetricsManager.formatCurrency(exp.amount)}</strong></td>
          <td><span class="badge ${statusBadgeClass}">${exp.status}</span></td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }
}

// Exporta para escopo global
window.ReportsManager = ReportsManager;
