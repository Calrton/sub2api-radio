<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  Activity,
  BarChart3,
  Boxes,
  ChevronDown,
  CircleHelp,
  Command,
  Cpu,
  Gauge,
  Image,
  LayoutDashboard,
  Moon,
  MoreHorizontal,
  Music2,
  Play,
  Plus,
  Search,
  Settings,
  Sun,
  Video,
  WalletCards,
  Zap,
} from '@lucide/vue'
import Sub2ApiRadio from '../src/components/Sub2ApiRadio.vue'
import { sampleTracks } from '../src/data/sampleTracks'
import type { RadioIntro } from '../src/lib/types'

const isDark = ref(false)
const radioRef = ref<InstanceType<typeof Sub2ApiRadio> | null>(null)

const radioIntro: RadioIntro = {
  title: '进入工作台',
  description: '让音乐在需要时响起，也可以安静地开始今天。',
  kicker: 'CONSOLE RADIO',
  primaryLabel: '开启音乐',
  secondaryLabel: '静音进入',
  meta: '随机播放 · 随时可换',
}

const navItems = [
  { label: 'Overview', icon: LayoutDashboard, active: true },
  { label: 'Playground', icon: Command },
  { label: 'Models', icon: Boxes },
  { label: 'Usage', icon: BarChart3 },
]

const imageModels = [
  { name: 'Image Studio', value: '68%', icon: Image },
  { name: 'Video Lab', value: '42%', icon: Video },
]

const metrics = [
  {
    label: 'Requests today',
    value: '12,840',
    delta: '+18.2%',
    note: 'vs. yesterday',
    icon: Activity,
    tone: 'teal',
  },
  {
    label: 'Tokens processed',
    value: '8.42M',
    delta: '+6.4%',
    note: 'across 14 models',
    icon: Cpu,
    tone: 'amber',
  },
  {
    label: 'Median latency',
    value: '742 ms',
    delta: '-12.8%',
    note: 'faster this week',
    icon: Gauge,
    tone: 'blue',
  },
]

const requests = [
  {
    model: 'gpt-4.1',
    type: 'Text',
    user: 'workspace-01',
    tokens: '12,408',
    latency: '684 ms',
    status: 'Success',
  },
  {
    model: 'flux-pro',
    type: 'Image',
    user: 'creative-lab',
    tokens: '1 image',
    latency: '4.2 s',
    status: 'Success',
  },
  {
    model: 'veo-3',
    type: 'Video',
    user: 'studio-east',
    tokens: '8 sec',
    latency: '18.6 s',
    status: 'Queued',
  },
  {
    model: 'deepseek-v3',
    type: 'Text',
    user: 'workspace-04',
    tokens: '9,216',
    tokensUnit: 'tokens',
    latency: '920 ms',
    status: 'Success',
  },
]

function openRadio() {
  radioRef.value?.open()
}

function toggleTheme() {
  isDark.value = !isDark.value
}

watch(
  isDark,
  (value) => {
    document.documentElement.dataset.theme = value ? 'dark' : 'light'
    localStorage.setItem('sub2api-radio-demo-theme', value ? 'dark' : 'light')
  },
  { immediate: true },
)

onMounted(() => {
  const savedTheme = localStorage.getItem('sub2api-radio-demo-theme')
  isDark.value =
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
})
</script>

<template>
  <div class="console-shell">
    <aside class="app-sidebar">
      <a class="app-brand" href="#" aria-label="Sub2API Radio demo home">
        <span class="brand-mark">
          <Command :size="20" aria-hidden="true" />
        </span>
        <span class="brand-copy">
          <strong>Sub2API Radio</strong>
          <small>Console integration</small>
        </span>
      </a>

      <button class="workspace-switcher" type="button">
        <span class="workspace-avatar">N</span>
        <span>
          <small>Workspace</small>
          <strong>Nebula Labs</strong>
        </span>
        <ChevronDown :size="15" aria-hidden="true" />
      </button>

      <nav class="sidebar-nav" aria-label="Main navigation">
        <a
          v-for="item in navItems"
          :key="item.label"
          href="#"
          :class="{ active: item.active }"
        >
          <component :is="item.icon" :size="18" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <div class="sidebar-label">Model groups</div>
      <nav class="sidebar-nav sidebar-model-nav" aria-label="Model groups">
        <a v-for="model in imageModels" :key="model.name" href="#">
          <component :is="model.icon" :size="17" aria-hidden="true" />
          <span>{{ model.name }}</span>
          <small>{{ model.value }}</small>
        </a>
      </nav>

      <div class="sidebar-bottom">
        <a href="#">
          <CircleHelp :size="18" aria-hidden="true" />
          <span>Documentation</span>
        </a>
        <a href="#">
          <Settings :size="18" aria-hidden="true" />
          <span>Settings</span>
        </a>
        <div class="sidebar-user">
          <span class="user-avatar">NO</span>
          <span>
            <strong>Nebula Owner</strong>
            <small>Workspace admin</small>
          </span>
          <MoreHorizontal :size="17" aria-hidden="true" />
        </div>
      </div>
    </aside>

    <div class="app-workspace">
      <header class="topbar">
        <a class="mobile-brand" href="#" aria-label="Sub2API Radio demo home">
          <Command :size="18" aria-hidden="true" />
          <strong>Sub2API Radio</strong>
        </a>
        <div class="breadcrumbs">
          <span>Nebula Labs</span>
          <span>/</span>
          <strong>Overview</strong>
        </div>
        <div class="topbar-actions">
          <label class="search-box">
            <Search :size="16" aria-hidden="true" />
            <input type="search" placeholder="Search" aria-label="Search" />
            <kbd>⌘ K</kbd>
          </label>
          <button
            class="topbar-icon"
            type="button"
            :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
            @click="toggleTheme"
          >
            <Sun v-if="isDark" :size="18" aria-hidden="true" />
            <Moon v-else :size="18" aria-hidden="true" />
          </button>
          <button class="new-request-button" type="button">
            <Plus :size="16" aria-hidden="true" />
            <span>New request</span>
          </button>
        </div>
      </header>

      <main class="dashboard">
        <section class="dashboard-heading">
          <div>
            <p>Friday, October 23</p>
            <h1>Workspace overview</h1>
            <span>Live preview of Sub2API Radio inside an AI console.</span>
          </div>
          <button class="date-button" type="button">
            Last 24 hours
            <ChevronDown :size="15" aria-hidden="true" />
          </button>
        </section>

        <section class="metric-grid" aria-label="Usage metrics">
          <article v-for="metric in metrics" :key="metric.label" class="metric-card">
            <div class="metric-top">
              <span class="metric-icon" :class="`is-${metric.tone}`">
                <component :is="metric.icon" :size="18" aria-hidden="true" />
              </span>
              <span class="metric-delta" :class="{ positive: metric.delta.startsWith('+') }">
                {{ metric.delta }}
              </span>
            </div>
            <strong>{{ metric.value }}</strong>
            <span class="metric-label">{{ metric.label }}</span>
            <small>{{ metric.note }}</small>
          </article>
        </section>

        <section class="dashboard-grid">
          <article class="panel request-panel">
            <header class="panel-head">
              <div>
                <h2>Recent requests</h2>
                <p>Requests routed through the workspace gateway.</p>
              </div>
              <button class="panel-action" type="button">View all</button>
            </header>

            <div class="request-table-wrap">
              <table class="request-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>User</th>
                    <th>Usage</th>
                    <th>Latency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="request in requests" :key="`${request.model}-${request.user}`">
                    <td>
                      <span class="model-cell">
                        <span class="model-icon">
                          <Image v-if="request.type === 'Image'" :size="14" />
                          <Video v-else-if="request.type === 'Video'" :size="14" />
                          <Zap v-else :size="14" />
                        </span>
                        <span>
                          <strong>{{ request.model }}</strong>
                          <small>{{ request.type }}</small>
                        </span>
                      </span>
                    </td>
                    <td>{{ request.user }}</td>
                    <td>{{ request.tokens }}</td>
                    <td>{{ request.latency }}</td>
                    <td>
                      <span class="status-pill" :class="{ queued: request.status === 'Queued' }">
                        {{ request.status }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <div class="side-stack">
            <article class="panel radio-preview-panel">
              <header class="panel-head compact">
                <div>
                  <h2>Console radio</h2>
                  <p>Now available beside every workflow.</p>
                </div>
                <span class="live-dot"><i></i> Ready</span>
              </header>

              <div class="radio-showcase">
                <div class="record-art" aria-hidden="true">
                  <div class="record-grooves"></div>
                  <span class="record-label">
                    <Music2 :size="20" />
                  </span>
                </div>
                <div class="radio-track-info">
                  <small>Sample track</small>
                  <strong>夜航信号</strong>
                  <span>原创合成氛围 · 24 sec</span>
                  <div class="signal-bars" aria-hidden="true">
                    <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
                  </div>
                </div>
              </div>

              <button class="open-radio-button" type="button" @click="openRadio">
                <Play :size="16" fill="currentColor" aria-hidden="true" />
                Open radio
              </button>
            </article>

            <article class="panel status-panel">
              <header class="panel-head compact">
                <div>
                  <h2>System status</h2>
                  <p>All systems operational.</p>
                </div>
                <span class="status-indicator"></span>
              </header>
              <div class="status-list">
                <div>
                  <span><Cpu :size="15" aria-hidden="true" /> Text gateway</span>
                  <strong>99.99%</strong>
                </div>
                <div>
                  <span><Image :size="15" aria-hidden="true" /> Image pipeline</span>
                  <strong>99.97%</strong>
                </div>
                <div>
                  <span><Video :size="15" aria-hidden="true" /> Video queue</span>
                  <strong>Healthy</strong>
                </div>
                <div>
                  <span><WalletCards :size="15" aria-hidden="true" /> Billing sync</span>
                  <strong>Healthy</strong>
                </div>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>

    <Sub2ApiRadio
      ref="radioRef"
      :tracks="sampleTracks"
      station-name="Sub2API Radio"
      storage-key="sub2api-radio-demo"
      :theme="isDark ? 'dark' : 'light'"
      :intro="radioIntro"
    />
  </div>
</template>
