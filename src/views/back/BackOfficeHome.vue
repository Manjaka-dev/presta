<template>
  <section class="home">
    <div class="home__content">
      <h1>Back Office</h1>
      <p class="muted">Point d'entree du back office.</p>
      <div class="button-row" style="justify-content: center;">
            <RouterLink to="/back/orders" class="button">Commandes</RouterLink>
        <RouterLink to="/back/import" class="button">Import CSV</RouterLink>
        <RouterLink to="/back/reset" class="button">Reset data</RouterLink>
        <RouterLink to="/" class="button button--ghost">Retour accueil</RouterLink>
      </div>
    </div>
  </section>
</template>

