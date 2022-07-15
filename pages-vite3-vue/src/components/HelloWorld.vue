<script setup>
import { ref } from 'vue'

defineProps({
  msg: String
})

const count = ref(0)
</script>

<template>
  <h1>{{ msg }}</h1>

  <div class="card">
    <button type="button" @click="count++">count is {{ count }}</button>
    <p>
      Edit
      <code>components/HelloWorld.vue</code> to test HMR
    </p>
  </div>

  <p>
    <strong>
      Check out the <a href="https://github.com/cloudflare/templates/tree/main/pages-vite3-vue">source for this project
        on GitHub</a></strong>
  </p>

  <p>
    Check out
    <a href="https://vuejs.org/guide/quick-start.html#local" target="_blank">create-vue</a>, the official Vue + Vite
    starter
  </p>
  <p>
    Install
    <a href="https://github.com/johnsoncodehk/volar" target="_blank">Volar</a>
    in your IDE for a better DX
  </p>
  <p class="read-the-docs">Click on the Vite, Vue, and Cloudflare Pages logos to learn more</p>
</template>

<style scoped>
.read-the-docs {
  color: #888;
}

a {
  font-weight: inherit;
}
</style>
