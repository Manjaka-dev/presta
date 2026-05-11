<template>
  <section class="home">
    <div class="home__content">
      <h1>Choix d'espace</h1>
      <p class="muted">
        Selectionnez l'espace a ouvrir.
      </p>
      <div class="button-row" style="justify-content: center;">
        <RouterLink to="/front" class="button">Aller au front office</RouterLink>
        <RouterLink to="/back" class="button button--ghost">Aller au back office</RouterLink>
      </div>
    </div>
  </section>
</template>

