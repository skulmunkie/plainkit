<script setup>
import { computed, reactive, ref } from 'vue';
import { EMAIL, MSG, PAGES, ROLES, view } from '../../shared/rows.js';

const errors = reactive({ name: '', email: '' });
const status = ref('');
const sort = reactive({ key: null, dir: null });
const page = ref(1);
const dialog = ref(null);
const rows = computed(() => view(sort.key, sort.dir, page.value));
function submit(e) {
    const f = new FormData(e.target), name = String(f.get('name')).trim(), email = String(f.get('email')).trim();
    errors.name = name ? '' : MSG.name;
    errors.email = EMAIL.test(email) ? '' : MSG.email;
    status.value = errors.name || errors.email ? '' : `Saved ${name}.`;
}
function toggle(key) {
    sort.dir = sort.key !== key ? 'asc' : sort.dir === 'asc' ? 'desc' : sort.dir === 'desc' ? null : 'asc';
    sort.key = key;
}
</script>

<template>
    <main>
        <h1>Team directory</h1>
        <form novalidate @submit.prevent="submit">
            <label>Name<input name="name" /><span v-if="errors.name" class="err">{{ errors.name }}</span></label>
            <label>Email<input name="email" type="email" /><span v-if="errors.email" class="err">{{ errors.email }}</span></label>
            <label>Role<select name="role"><option v-for="r in ROLES" :key="r">{{ r }}</option></select></label>
            <button type="submit">Add member</button>
            <p role="status">{{ status }}</p>
        </form>
        <table>
            <thead><tr>
                <th><button type="button" @click="toggle('name')">Name</button></th>
                <th>Role</th>
                <th><button type="button" @click="toggle('score')">Score</button></th>
            </tr></thead>
            <tbody><tr v-for="r in rows" :key="r.id"><td>{{ r.name }}</td><td>{{ r.role }}</td><td>{{ r.score }}</td></tr></tbody>
        </table>
        <div class="pager">
            <button type="button" :disabled="page === 1" @click="page--">Previous</button>
            <span>Page {{ page }} of {{ PAGES }}</span>
            <button type="button" :disabled="page === PAGES" @click="page++">Next</button>
        </div>
        <button type="button" @click="dialog.showModal()">Delete list</button>
        <dialog ref="dialog">
            <h2>Delete the list?</h2>
            <p>This cannot be undone.</p>
            <button type="button" @click="dialog.close()">Cancel</button>
            <button type="button" @click="dialog.close(); status = 'List deleted.'">Delete</button>
        </dialog>
    </main>
</template>
