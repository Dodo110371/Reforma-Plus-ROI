/**
 * Módulo de Métricas Financeiras e Cálculos de ROI
 * ReformaPlus ROI - PWA
 */

class MetricsManager {
  // Formatador de Moeda Brasileira (BRL)
  static formatCurrency(value) {
    const numeric = typeof value === 'number' ? value : Number(value || 0);
    if (!Number.isFinite(numeric)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  }

  // Formata valor numérico para string de moeda sem símbolo (para inputs editáveis): "1.234,56"
  static formatCurrencyForInput(value) {
    const numeric = typeof value === 'number' ? value : Number(value || 0);
    if (!Number.isFinite(numeric)) return '';
    const parts = numeric.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return integerPart + ',' + (parts[1] || '00');
  }

  // Parseia uma string formatada pt-BR para número: "R$ 1.234,56" ou "1.234,56" → 1234.56
  static parseCurrencyFromInput(str) {
    if (str == null) return 0;
    const cleaned = String(str).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
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

  // Gerador de Gráfico Pizza / Donut (SVG puro, sem dependências)
  static renderPieDonutChart(containerId, dataObject, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!dataObject || Object.keys(dataObject).length === 0) {
      container.innerHTML = '<p style="color: var(--text-dim); text-align: center; font-size: 0.9rem;">Nenhum dado cadastrado.</p>';
      return;
    }

    const palette = opts.palette || [
      '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
      '#14b8a6', '#eab308', '#22c55e', '#0ea5e9', '#a855f7'
    ];
    const entries = Object.entries(dataObject).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, v]) => sum + Number(v || 0), 0);
    if (total <= 0) {
      container.innerHTML = '<p style="color: var(--text-dim); text-align: center; font-size: 0.9rem;">Nenhum dado cadastrado.</p>';
      return;
    }

    const size = 220;
    const radius = 95;
    const innerR = 55;
    const cx = size / 2;
    const cy = size / 2;

    let cumulative = 0;
    let paths = '';
    entries.forEach(([label, value], idx) => {
      const startAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;
      cumulative += Number(value || 0);
      const endAngle = (cumulative / total) * Math.PI * 2 - Math.PI / 2;

      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);
      const xi1 = cx + innerR * Math.cos(endAngle);
      const yi1 = cy + innerR * Math.sin(endAngle);
      const xi2 = cx + innerR * Math.cos(startAngle);
      const yi2 = cy + innerR * Math.sin(startAngle);

      const d = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${xi1} ${yi1}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${xi2} ${yi2}`,
        'Z'
      ].join(' ');

      const color = palette[idx % palette.length];
      paths += `<path d="${d}" fill="${color}" stroke="rgba(255,255,255,0.95)" stroke-width="2"/>`;
    });

    const centerLabel = (opts.centerLabelTop || 'TOTAL') + `\n${MetricsManager.formatCurrency(total)}`;
    const centerTopY = cy - 10;
    const centerBotY = cy + 16;

    let legendHtml = '';
    entries.forEach(([label, value], idx) => {
      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
      const color = palette[idx % palette.length];
      legendHtml += `
        <div class="donut-legend-item">
          <span class="swatch" style="background:${color}"></span>
          <div class="legend-body">
            <span class="legend-label">${label}</span>
            <span class="legend-value">${MetricsManager.formatCurrency(value)} · ${pct}%</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = `
      <div class="donut-wrap">
        <div class="donut-svg-wrap">
          <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="max-width:100%;height:auto;">
            ${paths}
            <text x="${cx}" y="${centerTopY}" text-anchor="middle" class="donut-center-top">${opts.centerLabelTop || 'TOTAL'}</text>
            <text x="${cx}" y="${centerBotY}" text-anchor="middle" class="donut-center-value">${MetricsManager.formatCurrency(total)}</text>
          </svg>
        </div>
        <div class="donut-legend">${legendHtml}</div>
      </div>
    `;

    if (!document.getElementById('donut-inline-style')) {
      const st = document.createElement('style');
      st.id = 'donut-inline-style';
      st.textContent = `
        .donut-wrap{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:center;}
        .donut-svg-wrap{flex:0 0 auto;min-width:0;}
        .donut-legend{flex:1 1 220px;display:flex;flex-direction:column;gap:0.45rem;min-width:0;}
        .donut-legend-item{display:flex;align-items:flex-start;gap:0.55rem;}
        .donut-legend-item .swatch{flex:0 0 auto;width:12px;height:12px;border-radius:3px;margin-top:0.35rem;box-shadow:0 0 0 1px rgba(0,0,0,0.06);}
        .donut-legend-item .legend-body{display:flex;flex-direction:column;min-width:0;}
        .donut-legend-item .legend-label{font-size:0.82rem;color:var(--text-main,#0f172a);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .donut-legend-item .legend-value{font-size:0.74rem;color:var(--text-dim,#64748b);font-weight:500;}
        .donut-center-top{font-size:0.65rem;font-weight:700;fill:var(--text-dim,#64748b);letter-spacing:0.08em;text-transform:uppercase;}
        .donut-center-value{font-size:0.9rem;font-weight:800;fill:var(--text-main,#0f172a);}
        [data-theme="dark"] .donut-center-value{fill:#f8fafc;}
        [data-theme="dark"] .donut-center-top{fill:#94a3b8;}
        [data-theme="dark"] .donut-legend-item .legend-label{color:#f8fafc;}
        [data-theme="dark"] .donut-legend-item .legend-value{color:#94a3b8;}
        @media (max-width: 560px){
          .donut-wrap{flex-direction:column;gap:0.75rem;align-items:center;}
          .donut-legend{width:100%;}
        }
      `;
      document.head.appendChild(st);
    }
  }
}

// Exporta para o escopo global
window.MetricsManager = MetricsManager;
