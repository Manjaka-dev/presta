<script setup>
import { reactive } from 'vue'
import { runReset as _runReset } from '@/api/import/resetService'

const state = reactive({
  loading: false,
  success: 0,
  failed: 0,
  skipped: 0,
  warnings: 0,
  message: '',
  error: '',
})

const stats = reactive({
  total: 0,
  processed: 0,
  results: [], // { resource, status, count, error }
})

const runReset = async () => {
  await _runReset(state, stats)
}
</script>

<template>
  <section class="reset-page" :aria-busy="state.loading">
	<div class="reset-page__content">
	  <button
		class="button button--danger reset-page__button"
		type="button"
		:disabled="state.loading"
		@click="runReset"
	  >
		{{ state.loading ? 'Réinitialisation…' : 'Réinitialiser' }}
	  </button>

	  <p v-if="state.message && !state.error" class="reset-page__message reset-page__message--ok">
		{{ state.message }}
	  </p>
	  <p v-else-if="state.error" class="reset-page__message reset-page__message--error">
		{{ state.error }}
	  </p>

      <div v-if="stats.results.length && !state.loading" class="reset-page__results">
        <h3>Résumé</h3>
        <p class="reset-page__stats">
          Supprimé: <strong>{{ state.success }}</strong> |
          Échoué: <strong>{{ state.failed }}</strong> |
          Sauté: <strong>{{ state.skipped }}</strong> |
          TODO: <strong>{{ state.warnings }}</strong>
        </p>
        <ul class="reset-page__details">
          <li v-for="(result, idx) in stats.results" :key="idx" :class="`detail--${result.status}`">
            <span class="detail__resource">{{ result.resource }}</span>
            <span class="detail__count" v-if="result.count > 0">{{ result.count }} supprimé</span>
            <span class="detail__status" v-if="result.error">{{ result.error }}</span>
            <span class="detail__status detail__status--skip" v-else-if="result.status === 'skipped'">Rien à supprimer</span>
            <span class="detail__status detail__status--todo" v-else-if="result.status === 'todo'">À faire</span>
          </li>
        </ul>
      </div>
	</div>
  </section>
</template>

<style scoped>
.reset-page {
  min-height: calc(100vh - 4rem);
  display: grid;
  place-items: center;
}

.reset-page__content {
  display: grid;
  gap: 0.75rem;
  justify-items: center;
  text-align: center;
}

.reset-page__button {
  min-width: 180px;
}

.reset-page__message {
  margin: 0;
  font-size: 0.9rem;
}

.reset-page__message--ok {
  color: #2a8a43;
}

.reset-page__message--error {
  color: var(--danger);
}
</style>