export const MEMBERS = ['班新博', '龚丽', '李佳晟', '解勇宝', '叶玮佳'];

export function calculateStats(scheduleData) {
    const stats = {};
    MEMBERS.forEach(name => {
        stats[name] = { T1: 0, T2: 0, T3: 0, total: 0 };
    });

    scheduleData.forEach(item => {
        if (item.T1 && item.T1_done && stats[item.T1]) {
            stats[item.T1].T1++;
            stats[item.T1].total++;
        }
        if (item.T2_1 && item.T2_1_done && stats[item.T2_1]) {
            stats[item.T2_1].T2++;
            stats[item.T2_1].total++;
        }
        if (item.T2_2 && item.T2_2_done && stats[item.T2_2]) {
            stats[item.T2_2].T2++;
            stats[item.T2_2].total++;
        }
        if (item.T3 && item.T3_done && stats[item.T3]) {
            stats[item.T3].T3++;
            stats[item.T3].total++;
        }
    });

    return stats;
}

function rebuildStatsCards(stats, container) {
    container.innerHTML = '';

    MEMBERS.forEach(name => {
        const card = document.createElement('div');
        card.className = `stat-card p-${name}`;
        card.innerHTML = `
            <div class="name">${name}</div>
            <div class="stat-row">
                <span class="label">AI/产品工具</span>
                <span class="value">${stats[name].T1}</span>
            </div>
            <div class="stat-row">
                <span class="label">论文/开源项目</span>
                <span class="value">${stats[name].T2}</span>
            </div>
            <div class="stat-row">
                <span class="label">技术主题分享</span>
                <span class="value">${stats[name].T3}</span>
            </div>
            <div class="total-row">
                <span class="label">总计</span>
                <span class="value">${stats[name].total}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

export function renderStats(scheduleData) {
    const container = document.getElementById('statsCards');
    if (!container) {
        return;
    }

    const stats = calculateStats(scheduleData);
    const existingCards = container.querySelectorAll('.stat-card');

    if (existingCards.length !== MEMBERS.length) {
        rebuildStatsCards(stats, container);
        return;
    }

    let needsRebuild = false;

    MEMBERS.forEach((name, index) => {
        const card = existingCards[index];
        if (!card) {
            needsRebuild = true;
            return;
        }

        const t1Value = card.querySelector('.stat-row:nth-of-type(1) .value');
        const t2Value = card.querySelector('.stat-row:nth-of-type(2) .value');
        const t3Value = card.querySelector('.stat-row:nth-of-type(3) .value');
        const totalValue = card.querySelector('.total-row .value');

        if (!t1Value || !t2Value || !t3Value || !totalValue) {
            needsRebuild = true;
            return;
        }

        t1Value.textContent = stats[name].T1;
        t2Value.textContent = stats[name].T2;
        t3Value.textContent = stats[name].T3;
        totalValue.textContent = stats[name].total;
    });

    if (needsRebuild) {
        rebuildStatsCards(stats, container);
    }
}
