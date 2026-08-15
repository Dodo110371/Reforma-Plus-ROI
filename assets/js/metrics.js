/**
 * Módulo de Métricas Financeiras e Cálculos de ROI
 * ReformaPlus ROI - PWA
 */

class MetricsManager {
  // Formatador de Moeda Brasileira (BRL)
  static formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  }

  // Formatador de Porcentagem
  static formatPercent(value) {
    return (value || 0).toFixed(2).replace('.', ',') + '%';
  }

  // Análise Financeira Completa do Flip Imobiliário
  static calculatePropertyMetrics(propertyInfo, expenses) {
    const purchasePrice = Number(propertyInfo.purchasePrice || 0);
    const estimatedResalePrice = Number(propertyInfo.estimatedResalePrice || 0);
    const holdingCosts = Number(propertyInfo.holdingCosts || 0);

    let totalMaterials = 0;
    let totalServices = 0;
    let totalTaxesFees = 0;
    let totalOther = 0;
    let totalPaid = 0;
    let totalPending = 0;

    const categoryBreakdown = {};
    const roomBreakdown = {};

    expenses.forEach(exp => {
      const amount = Number(exp.amount || 0);

      // Soma por tipo
      if (exp.type === 'material') totalMaterials += amount;
      else if (exp.type === 'servico') totalServices += amount;
      else if (exp.type === 'taxa') totalTaxesFees += amount;
      else totalOther += amount;

      // Soma por status de pagamento
      if (exp.status === 'pago') totalPaid += amount;
      else totalPending += amount;

      // Acumula por categoria
      const cat = exp.category || 'Outros';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amount;

      // Acumula por ambiente
      const room = exp.room || 'Geral';
      roomBreakdown[room] = (roomBreakdown[room] || 0) + amount;
    });

    const totalRenovationCost = totalMaterials + totalServices + totalTaxesFees + totalOther;
    const totalInvestment = purchasePrice + totalRenovationCost + holdingCosts;
    const expectedNetProfit = estimatedResalePrice - totalInvestment;
    const roiPercentage = totalInvestment > 0 ? (expectedNetProfit / totalInvestment) * 100 : 0;
    const profitMarginPercentage = estimatedResalePrice > 0 ? (expectedNetProfit / estimatedResalePrice) * 100 : 0;

    return {
      purchasePrice,
      estimatedResalePrice,
      holdingCosts,
      totalMaterials,
      totalServices,
      totalTaxesFees,
      totalOther,
      totalRenovationCost,
      totalInvestment,
      expectedNetProfit,
      roiPercentage,
      profitMarginPercentage,
      totalPaid,
      totalPending,
      categoryBreakdown,
      roomBreakdown
    };
  }

  // Gerador de Gráfico de Barras Responsivo em SVG Puro
  static renderCustomBarChart(containerId, dataObject, totalValue) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!dataObject || Object.keys(dataObject).length === 0) {
      container.innerHTML = '<p style="color: var(--text-dim); text-align: center; font-size: 0.9rem;">Nenhum dado cadastrado.</p>';
      return;
    }

    const entries = Object.entries(dataObject).sort((a, b) => b[1] - a[1]);
    let html = '<div class="custom-chart-bar">';

    entries.forEach(([label, amount]) => {
      const percentage = totalValue > 0 ? ((amount / totalValue) * 100).toFixed(1) : 0;
      html += `
        <div class="chart-item">
          <div class="chart-item-header">
            <span>${label}</span>
            <span>${MetricsManager.formatCurrency(amount)} (${percentage}%)</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${percentage}%"></div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }
}

// Exporta para o escopo global
window.MetricsManager = MetricsManager;
