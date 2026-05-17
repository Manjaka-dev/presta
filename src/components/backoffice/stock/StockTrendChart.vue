<template>
  <div class="chart-wrapper">
    <h4>📈 Évolution du stock (derniers 30 jours)</h4>
    <div v-if="chartData.length === 0" class="no-data-chart">
      <p>Aucune donnée pour afficher le graphique</p>
    </div>
    <div v-else class="simple-chart">
      <div class="chart-bars">
        <div
          v-for="(entry, idx) in chartData"
          :key="idx"
          class="bar-container"
        >
          <div
            class="bar"
            :style="{ height: entry.barHeight + '%' }"
            :class="entry.changes > 0 ? 'bar-positive' : 'bar-negative'"
            :title="`${entry.date}: ${entry.changes} changements`"
          ></div>
          <div class="bar-label">{{ entry.dateShort }}</div>
        </div>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="dot positive"></span> Augmentation</span>
        <span class="legend-item"><span class="dot negative"></span> Diminution</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  movements: {
    type: Array,
    required: true,
  },
})

const chartData = computed(() => {
  if (!props.movements || props.movements.length === 0) return []

  const dailyChanges = {}
  props.movements.forEach(m => {
    const dateStr = m.date_add ? m.date_add.substring(0, 10) : null // "YYYY-MM-DD"
    if (dateStr) {
      if (!dailyChanges[dateStr]) {
        dailyChanges[dateStr] = { count: 0, quantity: 0 }
      }
      const qty = parseInt(m.physical_quantity || 0)
      const sign = parseInt(m.sign || 1)
      dailyChanges[dateStr].count += 1
      dailyChanges[dateStr].quantity += (qty * sign)
    }
  })

  const maxChanges = Math.max(
    ...Object.values(dailyChanges).map(d => Math.abs(d.quantity)),
    1
  )

  return Object.entries(dailyChanges)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30)
    .map(([dateStr, data]) => {
      const parts = dateStr.split('-') // ["YYYY", "MM", "DD"]
      const dateShort = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr
      const fullDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr
      return {
        date: fullDate,
        dateShort,
        changes: data.quantity,
        barHeight: (Math.abs(data.quantity) / maxChanges) * 100,
      }
    })
})
</script>

<style scoped>
.chart-wrapper {
  margin: 2rem 0;
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
}

.chart-wrapper h4 {
  margin-top: 0;
  color: #333;
}

.no-data-chart {
  text-align: center;
  color: #999;
  padding: 1rem;
}

.chart-bars {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  height: 200px;
  margin-bottom: 1rem;
}

.bar-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
}

.bar {
  width: 100%;
  border-radius: 4px 4px 0 0;
  min-height: 2px;
  cursor: pointer;
}

.bar-positive {
  background: #28a745;
}

.bar-negative {
  background: #dc3545;
}

.bar-label {
  font-size: 0.7rem;
  color: #666;
  margin-top: 0.25rem;
}
.chart-legend {
    display: flex;
    justify-content: center;
    gap: 1rem;
}
.legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #333;
}
.dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
}
.dot.positive {
    background-color: #28a745;
}
.dot.negative {
    background-color: #dc3545;
}
</style>