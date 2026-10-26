<template>
  <AppLayout>
    <div class="ranking-page">
      <header class="ranking-head">
        <div class="ranking-title-lock">
          <span class="ranking-title-icon">
            <Icon name="trophy" size="lg" />
          </span>
          <div class="ranking-title-copy">
            <p class="ranking-eyebrow">{{ t('userRanking.eyebrow') }}</p>
            <h1>{{ t('userRanking.title') }}</h1>
            <p>{{ t('userRanking.description') }}</p>
          </div>
        </div>

        <div class="ranking-actions">
          <div class="ranking-segment" role="tablist" :aria-label="t('userRanking.title')">
            <button
              type="button"
              role="tab"
              class="ranking-segment-button"
              :class="{ 'is-active': period === 'daily' }"
              :aria-selected="period === 'daily'"
              data-testid="user-ranking-period-daily"
              @click="setPeriod('daily')"
            >
              {{ t('userRanking.daily') }}
            </button>
            <button
              type="button"
              role="tab"
              class="ranking-segment-button"
              :class="{ 'is-active': period === 'weekly' }"
              :aria-selected="period === 'weekly'"
              data-testid="user-ranking-period-weekly"
              @click="setPeriod('weekly')"
            >
              {{ t('userRanking.weekly') }}
            </button>
          </div>

          <button
            type="button"
            class="ranking-refresh"
            :disabled="loading"
            data-testid="user-ranking-refresh"
            @click="loadRanking"
          >
            <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
            {{ t('common.refresh') }}
          </button>
        </div>
      </header>

      <div class="ranking-period-strip">
        <div class="ranking-period-main">
          <Icon name="calendar" size="sm" />
          <span>{{ t('userRanking.dateRange') }}</span>
          <strong v-if="rankingResponse" data-testid="user-ranking-date-range">
            {{ rankingResponse.start_date }} - {{ rankingResponse.end_date }}
          </strong>
          <span class="ranking-period-separator"></span>
          <span>{{ t('userRanking.rankByTokens') }}</span>
        </div>
        <span class="ranking-source">
          <span class="ranking-live-dot"></span>
          {{ t('userRanking.dataSource') }}
        </span>
      </div>

      <div
        v-if="loading"
        class="ranking-state"
        data-testid="user-ranking-loading"
      >
        <LoadingSpinner />
        <p>{{ t('userRanking.loading') }}</p>
      </div>

      <div
        v-else-if="loadError"
        class="ranking-state ranking-state-error"
        data-testid="user-ranking-error"
      >
        <span class="ranking-state-icon">
          <Icon name="exclamationCircle" size="lg" />
        </span>
        <p>{{ t('userRanking.loadFailed') }}</p>
        <button type="button" class="ranking-retry" data-testid="user-ranking-retry" @click="loadRanking">
          <Icon name="refresh" size="sm" />
          {{ t('userRanking.retry') }}
        </button>
      </div>

      <div
        v-else-if="ranking.length === 0"
        class="ranking-state"
        data-testid="user-ranking-empty"
      >
        <span class="ranking-state-icon">
          <Icon name="users" size="lg" />
        </span>
        <p>{{ t('userRanking.empty') }}</p>
        <span>{{ t('userRanking.emptyDescription') }}</span>
      </div>

      <template v-else>
        <section class="ranking-podium-section" data-testid="user-ranking-podium">
          <div class="ranking-section-head">
            <div>
              <p class="ranking-eyebrow">{{ t('userRanking.podiumKicker') }}</p>
              <h2>{{ t('userRanking.podiumTitle') }}</h2>
            </div>
            <p class="ranking-section-copy">{{ t('userRanking.podiumDescription') }}</p>
          </div>

          <div class="ranking-podium-stage" :class="`podium-count-${podiumEntries.length}`">
            <article
              v-for="{ entry, rank } in podiumEntries"
              :key="`podium-${rank}-${entry.email}`"
              class="ranking-podium-card"
              :class="[`rank-${rank}`, medalClass(rank)]"
              data-testid="user-ranking-podium-card"
            >
              <div class="ranking-medal-ribbon">
                <span class="ranking-medal-dot"></span>
                <span v-if="rank === 1">{{ t('userRanking.champion') }}</span>
                <span v-else-if="rank === 2">{{ t('userRanking.runnerUp') }}</span>
                <span v-else>{{ t('userRanking.thirdPlace') }}</span>
              </div>

              <div class="ranking-podium-profile">
                <span class="ranking-avatar">{{ initials(entry.email) }}</span>
                <div class="ranking-profile-copy">
                  <strong :title="entry.email">{{ entry.email || t('common.unknown') }}</strong>
                  <span>{{ t('userRanking.requestCount', { count: formatNumberLocaleString(entry.requests) }) }}</span>
                </div>
                <span class="ranking-rank-stamp">{{ rank }}</span>
              </div>

              <div class="ranking-podium-token">
                <span>{{ t('userRanking.totalTokens') }}</span>
                <strong>{{ formatRankingTokens(entry.total_tokens) }}</strong>
              </div>

              <div class="ranking-podium-share">
                <span>
                  {{ t('userRanking.topShare', {
                    count: ranking.length,
                    percent: formatPercent(topShare(entry))
                  }) }}
                </span>
                <strong>
                  {{ formatPercent(relativeToLeader(entry)) }}
                  <small>{{ t('userRanking.relativeToLeader') }}</small>
                </strong>
              </div>
            </article>
          </div>
        </section>

        <section v-if="restRanking.length" class="ranking-list-section">
          <div class="ranking-section-head">
            <div>
              <p class="ranking-eyebrow">{{ t('userRanking.fullRankingKicker') }}</p>
              <h2>{{ t('userRanking.fullRanking') }}</h2>
            </div>
            <div class="ranking-legend">
              <span><i class="ranking-dot dot-input"></i>{{ t('userRanking.inputTokens') }}</span>
              <span><i class="ranking-dot dot-output"></i>{{ t('userRanking.outputTokens') }}</span>
              <span><i class="ranking-dot dot-cache"></i>{{ t('userRanking.cacheTokens') }}</span>
            </div>
          </div>

          <div class="ranking-detail-header" aria-hidden="true">
            <span>{{ t('userRanking.rank') }}</span>
            <span>{{ t('userRanking.email') }}</span>
            <span>{{ t('userRanking.requests') }}</span>
            <span>{{ t('userRanking.tokenComposition') }}</span>
            <span>{{ t('userRanking.totalTokens') }}</span>
          </div>

          <div class="ranking-detail-list" data-testid="user-ranking-list">
            <article
              v-for="{ entry, rank } in restRanking"
              :key="`ranking-${rank}-${entry.email}`"
              class="ranking-detail-row"
              :class="rank <= 3 ? `is-medal ${medalClass(rank)}` : ''"
              data-testid="user-ranking-row"
            >
              <div class="ranking-rank-cell">
                <span>{{ rank }}</span>
              </div>

              <div class="ranking-user-cell">
                <span class="ranking-mini-avatar">{{ initials(entry.email) }}</span>
                <div>
                  <strong :title="entry.email">{{ entry.email || t('common.unknown') }}</strong>
                  <span>{{ t('userRanking.activeUser') }}</span>
                </div>
              </div>

              <div class="ranking-request-cell">
                <strong>{{ formatNumberLocaleString(entry.requests) }}</strong>
                <span>{{ t('userRanking.requestsUnit') }}</span>
              </div>

              <div class="ranking-progress-cell">
                <div class="ranking-token-split">
                  <span><i class="ranking-dot dot-input"></i>{{ t('userRanking.inputShort') }} {{ formatRankingTokens(entry.input_tokens) }}</span>
                  <span><i class="ranking-dot dot-output"></i>{{ t('userRanking.outputShort') }} {{ formatRankingTokens(entry.output_tokens) }}</span>
                  <span><i class="ranking-dot dot-cache"></i>{{ t('userRanking.cacheShort') }} {{ formatRankingTokens(entry.cache_tokens) }}</span>
                </div>
                <div class="ranking-bar-row">
                  <div class="ranking-progress-track">
                    <span :style="{ width: relativeWidth(entry) }"></span>
                  </div>
                  <strong>{{ formatPercent(relativeToLeader(entry)) }}</strong>
                </div>
              </div>

              <div class="ranking-total-cell">
                <strong>{{ formatRankingTokens(entry.total_tokens) }}</strong>
                <span>
                  {{ t('userRanking.topShare', {
                    count: ranking.length,
                    percent: formatPercent(topShare(entry))
                  }) }}
                </span>
              </div>
            </article>
          </div>
        </section>

        <section class="ranking-snapshot" :aria-label="t('userRanking.snapshotTitle')">
          <div class="ranking-snapshot-title">
            <span class="ranking-snapshot-icon">
              <Icon name="trendingUp" size="md" />
            </span>
            <div>
              <p class="ranking-eyebrow">{{ t('userRanking.snapshotKicker') }}</p>
              <h2>{{ t('userRanking.snapshotTitle') }}</h2>
            </div>
          </div>

          <div class="ranking-summary-grid">
            <div class="ranking-summary-item">
              <span class="ranking-summary-icon"><Icon name="users" size="sm" /></span>
              <div>
                <span>{{ t('userRanking.rankedUsers') }}</span>
                <strong>{{ ranking.length }}</strong>
              </div>
            </div>
            <div class="ranking-summary-item">
              <span class="ranking-summary-icon"><Icon name="bolt" size="sm" /></span>
              <div>
                <span>{{ t('userRanking.totalRequests') }}</span>
                <strong>{{ formatNumberLocaleString(totalRequests) }}</strong>
              </div>
            </div>
            <div class="ranking-summary-item">
              <span class="ranking-summary-icon"><Icon name="chartBar" size="sm" /></span>
              <div>
                <span>{{ t('userRanking.topTokens', { count: ranking.length }) }}</span>
                <strong>{{ formatRankingTokens(totalTokens) }}</strong>
              </div>
            </div>
            <div class="ranking-summary-item">
              <span class="ranking-summary-icon"><Icon name="trophy" size="sm" /></span>
              <div>
                <span>{{ t('userRanking.leaderShare') }}</span>
                <strong>{{ formatPercent(leaderShare) }}</strong>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import {
  getUserRanking,
  type UserRankingEntry,
  type UserRankingPeriod,
  type UserRankingResponse
} from '@/api/usage'
import { formatNumberLocaleString, getBrowserTimeZone } from '@/utils/format'

interface RankedEntry {
  entry: UserRankingEntry
  rank: number
}

const { t } = useI18n()

const period = ref<UserRankingPeriod>('daily')
const rankingResponse = ref<UserRankingResponse | null>(null)
const loading = ref(false)
const loadError = ref(false)
let requestSequence = 0

const ranking = computed(() => rankingResponse.value?.ranking ?? [])
const totalTokens = computed(() => ranking.value.reduce((sum, entry) => sum + entry.total_tokens, 0))
const totalRequests = computed(() => ranking.value.reduce((sum, entry) => sum + entry.requests, 0))
const leaderShare = computed(() => topShare(ranking.value[0]))

const podiumEntries = computed<RankedEntry[]>(() => {
  const podiumOrder = [2, 1, 3]
  return podiumOrder
    .filter((rank) => rank <= ranking.value.length)
    .map((rank) => ({
      entry: ranking.value[rank - 1],
      rank
    }))
})

const restRanking = computed<RankedEntry[]>(() =>
  ranking.value.slice(3).map((entry, index) => ({
    entry,
    rank: index + 4
  }))
)

function medalClass(rank: number): string {
  if (rank === 1) return 'medal-gold'
  if (rank === 2) return 'medal-silver'
  return 'medal-bronze'
}

function initials(email: string): string {
  const local = (email.split('@')[0] ?? '').replace(/\*/g, '').trim()
  return local ? Array.from(local).slice(0, 2).join('').toUpperCase() : 'XI'
}

function relativeToLeader(entry: UserRankingEntry | undefined): number {
  const leaderTokens = ranking.value[0]?.total_tokens ?? 0
  return leaderTokens > 0 && entry ? (entry.total_tokens / leaderTokens) * 100 : 0
}

function relativeWidth(entry: UserRankingEntry): string {
  return `${Math.max(1.4, relativeToLeader(entry)).toFixed(2)}%`
}

function topShare(entry: UserRankingEntry | undefined): number {
  return totalTokens.value > 0 && entry ? (entry.total_tokens / totalTokens.value) * 100 : 0
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  if (value >= 10) return `${value.toFixed(0)}%`
  if (value >= 1) return `${value.toFixed(1)}%`
  return `${value.toFixed(2)}%`
}

function formatRankingTokens(value: number): string {
  if (!Number.isFinite(value)) return '0'

  const absolute = Math.abs(value)
  if (absolute >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`
  }
  if (absolute >= 10_000) {
    return `${(value / 10_000).toFixed(1).replace(/\.0$/, '')}万`
  }
  return Math.round(value).toLocaleString('zh-CN')
}

async function loadRanking() {
  const sequence = ++requestSequence
  loading.value = true
  loadError.value = false

  try {
    const response = await getUserRanking({
      period: period.value,
      limit: 20,
      timezone: getBrowserTimeZone()
    })
    if (sequence !== requestSequence) return
    rankingResponse.value = response
  } catch {
    if (sequence !== requestSequence) return
    rankingResponse.value = null
    loadError.value = true
  } finally {
    if (sequence === requestSequence) {
      loading.value = false
    }
  }
}

function setPeriod(nextPeriod: UserRankingPeriod) {
  if (period.value === nextPeriod) return
  period.value = nextPeriod
  void loadRanking()
}

onMounted(() => {
  void loadRanking()
})
</script>

<style scoped>
.ranking-page {
  --ranking-text: #0f172a;
  --ranking-text-soft: #334155;
  --ranking-muted: #64748b;
  --ranking-muted-soft: #94a3b8;
  --ranking-line: #e2e8f0;
  --ranking-line-strong: #cbd5e1;
  --ranking-surface: rgba(255, 255, 255, 0.94);
  --ranking-surface-strong: #ffffff;
  --ranking-surface-hover: #f8fafc;
  --ranking-teal: #0f9f8f;
  --ranking-teal-soft: #0f766e;
  --ranking-teal-rgb: 15, 159, 143;
  --ranking-blue: #2563eb;
  --ranking-gold: #b7791f;
  --ranking-gold-soft: #8a5a12;
  --ranking-gold-rgb: 183, 121, 31;
  --ranking-silver: #64748b;
  --ranking-silver-rgb: 100, 116, 139;
  --ranking-bronze: #b45309;
  --ranking-bronze-rgb: 180, 83, 9;
  --ranking-shadow: 0 18px 42px rgba(15, 23, 42, 0.07);
  min-width: 0;
  color: var(--ranking-text);
}

:global(html.dark .ranking-page) {
  --ranking-text: #f2f7fc;
  --ranking-text-soft: #c3d0df;
  --ranking-muted: #8298b3;
  --ranking-muted-soft: #60758e;
  --ranking-line: rgba(132, 157, 190, 0.16);
  --ranking-line-strong: rgba(144, 172, 208, 0.26);
  --ranking-surface: rgba(13, 25, 43, 0.9);
  --ranking-surface-strong: #111f34;
  --ranking-surface-hover: #15253d;
  --ranking-teal: #2dd4bf;
  --ranking-teal-soft: #74eadc;
  --ranking-teal-rgb: 45, 212, 191;
  --ranking-blue: #6ba7ff;
  --ranking-gold: #f3c65e;
  --ranking-gold-soft: #ffe4a1;
  --ranking-gold-rgb: 243, 198, 94;
  --ranking-silver: #c5d1df;
  --ranking-silver-rgb: 197, 209, 223;
  --ranking-bronze: #d18b61;
  --ranking-bronze-rgb: 209, 139, 97;
  --ranking-shadow: 0 22px 48px rgba(0, 0, 0, 0.24);
}

.ranking-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
  padding: 6px 0 24px;
}

.ranking-title-lock {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 15px;
}

.ranking-title-icon {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ranking-teal-soft);
  background: rgba(var(--ranking-teal-rgb), 0.08);
  border: 1px solid rgba(var(--ranking-teal-rgb), 0.2);
  border-radius: 12px;
}

.ranking-title-copy {
  min-width: 0;
}

.ranking-eyebrow {
  margin: 0 0 6px;
  color: var(--ranking-teal);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.16em;
}

.ranking-title-copy h1 {
  margin: 0 0 6px;
  color: var(--ranking-text);
  font-size: 30px;
  font-weight: 800;
  line-height: 1.1;
}

.ranking-title-copy > p:last-child {
  max-width: 680px;
  margin: 0;
  color: var(--ranking-muted);
  font-size: 13px;
  line-height: 1.7;
}

.ranking-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  padding-top: 2px;
}

.ranking-segment {
  display: flex;
  padding: 4px;
  background: var(--ranking-surface);
  border: 1px solid var(--ranking-line);
  border-radius: 10px;
}

.ranking-segment-button {
  min-width: 60px;
  padding: 8px 15px;
  color: var(--ranking-muted);
  background: transparent;
  border: 0;
  border-radius: 7px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  transition: color 160ms ease, background 160ms ease;
}

.ranking-segment-button:hover {
  color: var(--ranking-text);
}

.ranking-segment-button.is-active {
  color: var(--ranking-teal-soft);
  background: rgba(var(--ranking-teal-rgb), 0.13);
  box-shadow: inset 0 0 0 1px rgba(var(--ranking-teal-rgb), 0.14);
}

.ranking-refresh,
.ranking-retry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 14px;
  color: var(--ranking-text-soft);
  background: var(--ranking-surface);
  border: 1px solid var(--ranking-line);
  border-radius: 9px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
}

.ranking-refresh:hover,
.ranking-retry:hover {
  color: var(--ranking-text);
  background: var(--ranking-surface-strong);
  border-color: var(--ranking-line-strong);
}

.ranking-refresh:disabled {
  cursor: wait;
  opacity: 0.7;
}

.ranking-segment-button:focus-visible,
.ranking-refresh:focus-visible,
.ranking-retry:focus-visible {
  outline: 2px solid var(--ranking-teal);
  outline-offset: 2px;
}

.ranking-period-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 12px 0;
  color: var(--ranking-muted);
  border-top: 1px solid var(--ranking-line);
  border-bottom: 1px solid var(--ranking-line);
  font-size: 12px;
}

.ranking-period-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.ranking-period-main strong {
  color: var(--ranking-text-soft);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ranking-period-separator {
  width: 1px;
  height: 12px;
  margin: 0 3px;
  background: var(--ranking-line-strong);
}

.ranking-source {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.ranking-live-dot {
  width: 7px;
  height: 7px;
  background: var(--ranking-teal);
  border-radius: 999px;
  box-shadow: 0 0 0 4px rgba(var(--ranking-teal-rgb), 0.1);
}

.ranking-state {
  display: flex;
  min-height: 300px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 28px;
  padding: 32px;
  color: var(--ranking-muted);
  background: var(--ranking-surface);
  border: 1px solid var(--ranking-line);
  border-radius: 12px;
  text-align: center;
}

.ranking-state p {
  margin: 0;
  color: var(--ranking-text);
  font-size: 14px;
  font-weight: 650;
}

.ranking-state > span:last-child {
  color: var(--ranking-muted);
  font-size: 12px;
}

.ranking-state-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  color: var(--ranking-muted);
  background: rgba(var(--ranking-teal-rgb), 0.06);
  border-radius: 999px;
}

.ranking-state-error .ranking-state-icon {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
}

.ranking-podium-section,
.ranking-list-section {
  margin-top: 34px;
}

.ranking-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 16px;
}

.ranking-section-head h2,
.ranking-snapshot-title h2 {
  margin: 0;
  color: var(--ranking-text);
  font-size: 20px;
  font-weight: 750;
  line-height: 1.25;
}

.ranking-section-copy {
  max-width: 460px;
  margin: 0;
  color: var(--ranking-muted);
  font-size: 12px;
  line-height: 1.7;
  text-align: right;
}

.ranking-podium-stage {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: 16px;
  padding-top: 14px;
}

.ranking-podium-stage.podium-count-1 {
  grid-template-columns: minmax(0, 420px);
  justify-content: center;
}

.ranking-podium-stage.podium-count-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.ranking-podium-card {
  --medal: var(--ranking-gold);
  --medal-soft: var(--ranking-gold-soft);
  --medal-rgb: var(--ranking-gold-rgb);
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 20px;
  background:
    linear-gradient(180deg, rgba(var(--medal-rgb), 0.08), transparent 42%),
    var(--ranking-surface);
  border: 1px solid rgba(var(--medal-rgb), 0.2);
  border-radius: 12px;
  box-shadow: var(--ranking-shadow);
}

.ranking-podium-card::before {
  position: absolute;
  top: 0;
  left: 18px;
  width: 74px;
  height: 2px;
  background: rgb(var(--medal-rgb));
  border-radius: 0 0 999px 999px;
  content: "";
}

.ranking-podium-card.medal-silver {
  --medal: var(--ranking-silver);
  --medal-soft: var(--ranking-silver);
  --medal-rgb: var(--ranking-silver-rgb);
}

.ranking-podium-card.medal-bronze {
  --medal: var(--ranking-bronze);
  --medal-soft: var(--ranking-bronze);
  --medal-rgb: var(--ranking-bronze-rgb);
}

.ranking-podium-card.rank-1 {
  min-height: 250px;
  padding: 22px;
  background:
    linear-gradient(180deg, rgba(var(--ranking-gold-rgb), 0.12), transparent 48%),
    linear-gradient(120deg, var(--ranking-surface-strong), var(--ranking-surface) 60%, rgba(var(--ranking-gold-rgb), 0.05));
  border-color: rgba(var(--ranking-gold-rgb), 0.32);
}

.ranking-podium-card.rank-2 {
  min-height: 222px;
}

.ranking-podium-card.rank-3 {
  min-height: 208px;
}

.ranking-medal-ribbon {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 18px;
  padding: 5px 9px;
  color: var(--medal);
  background: rgba(var(--medal-rgb), 0.08);
  border: 1px solid rgba(var(--medal-rgb), 0.13);
  border-radius: 999px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.1em;
}

.ranking-medal-dot {
  width: 5px;
  height: 5px;
  background: var(--medal);
  border-radius: 999px;
  box-shadow: 0 0 9px rgba(var(--medal-rgb), 0.7);
}

.ranking-podium-profile {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.ranking-avatar {
  display: grid;
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ranking-text);
  background: rgba(var(--medal-rgb), 0.15);
  border: 1px solid rgba(var(--medal-rgb), 0.32);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.rank-1 .ranking-avatar {
  width: 52px;
  height: 52px;
  box-shadow: 0 0 24px rgba(var(--ranking-gold-rgb), 0.12);
}

.ranking-profile-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.ranking-profile-copy strong {
  overflow: hidden;
  color: var(--ranking-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-profile-copy span {
  color: var(--ranking-muted);
  font-size: 11px;
}

.ranking-rank-stamp {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--medal);
  border: 1px solid rgba(var(--medal-rgb), 0.24);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.ranking-podium-token {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(var(--medal-rgb), 0.13);
}

.ranking-podium-token span {
  color: var(--ranking-muted);
  font-size: 11px;
}

.ranking-podium-token strong {
  color: var(--ranking-text);
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.rank-1 .ranking-podium-token strong {
  color: var(--ranking-gold-soft);
  font-size: 29px;
}

.ranking-podium-share {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  color: var(--ranking-muted);
  font-size: 10px;
}

.ranking-podium-share strong {
  color: var(--ranking-text-soft);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ranking-podium-share small {
  margin-left: 3px;
  color: var(--ranking-muted-soft);
  font-size: 9px;
  font-weight: 500;
}

.ranking-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--ranking-muted);
  font-size: 10px;
}

.ranking-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.ranking-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 2px;
}

.dot-input {
  background: var(--ranking-blue);
}

.dot-output {
  background: var(--ranking-teal);
}

.dot-cache {
  background: var(--ranking-muted-soft);
}

.ranking-detail-header,
.ranking-detail-row {
  display: grid;
  grid-template-columns: 48px minmax(180px, 1.1fr) 78px minmax(300px, 2fr) 122px;
  align-items: center;
  gap: 16px;
}

.ranking-detail-header {
  padding: 0 18px 10px;
  color: var(--ranking-muted-soft);
  font-size: 10px;
}

.ranking-detail-header > span:last-child {
  text-align: right;
}

.ranking-detail-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ranking-detail-row {
  min-width: 0;
  min-height: 74px;
  padding: 12px 18px;
  background: var(--ranking-surface);
  border: 1px solid var(--ranking-line);
  border-radius: 10px;
  transition: border-color 150ms ease, background 150ms ease, transform 150ms ease;
}

.ranking-detail-row:hover {
  background: var(--ranking-surface-hover);
  border-color: var(--ranking-line-strong);
  transform: translateY(-1px);
}

.ranking-rank-cell span {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--ranking-muted);
  background: rgba(100, 116, 139, 0.06);
  border: 1px solid rgba(100, 116, 139, 0.13);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.ranking-user-cell {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
}

.ranking-mini-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ranking-teal-soft);
  background: rgba(var(--ranking-teal-rgb), 0.07);
  border: 1px solid rgba(var(--ranking-teal-rgb), 0.16);
  border-radius: 9px;
  font-size: 10px;
  font-weight: 800;
}

.ranking-user-cell > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.ranking-user-cell strong {
  overflow: hidden;
  color: var(--ranking-text-soft);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-user-cell span:last-child {
  color: var(--ranking-muted-soft);
  font-size: 9px;
}

.ranking-request-cell,
.ranking-total-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.ranking-request-cell strong,
.ranking-total-cell strong {
  color: var(--ranking-text-soft);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ranking-request-cell span,
.ranking-total-cell span {
  color: var(--ranking-muted-soft);
  font-size: 9px;
}

.ranking-total-cell {
  text-align: right;
}

.ranking-total-cell strong {
  color: var(--ranking-text);
  font-size: 14px;
  font-weight: 750;
}

.ranking-progress-cell {
  min-width: 0;
}

.ranking-token-split {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 8px;
  color: var(--ranking-muted);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.ranking-token-split span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.ranking-bar-row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.ranking-progress-track {
  position: relative;
  height: 5px;
  flex: 1;
  overflow: hidden;
  background: rgba(100, 116, 139, 0.13);
  border-radius: 999px;
}

.ranking-progress-track > span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--ranking-teal-soft), var(--ranking-teal));
  border-radius: inherit;
  box-shadow: 0 0 12px rgba(var(--ranking-teal-rgb), 0.22);
}

.ranking-bar-row > strong {
  width: 38px;
  color: var(--ranking-muted);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.ranking-snapshot {
  display: grid;
  grid-template-columns: minmax(190px, 0.7fr) minmax(0, 2.3fr);
  align-items: center;
  gap: 28px;
  margin-top: 30px;
  padding: 22px 0;
  border-top: 1px solid var(--ranking-line);
  border-bottom: 1px solid var(--ranking-line);
}

.ranking-snapshot-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ranking-snapshot-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ranking-teal);
  border: 1px solid rgba(var(--ranking-teal-rgb), 0.16);
  border-radius: 10px;
}

.ranking-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  background: var(--ranking-line);
}

.ranking-summary-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
  padding: 4px 16px;
  background: var(--ranking-surface-strong);
}

.ranking-summary-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ranking-teal);
  background: rgba(var(--ranking-teal-rgb), 0.06);
  border-radius: 8px;
}

.ranking-summary-item > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.ranking-summary-item span {
  color: var(--ranking-muted);
  font-size: 9px;
}

.ranking-summary-item strong {
  overflow: hidden;
  color: var(--ranking-text);
  font-size: 15px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .ranking-detail-header {
    display: none;
  }

  .ranking-detail-row {
    grid-template-columns: 40px minmax(170px, 1fr) minmax(180px, 1.2fr) 110px;
  }

  .ranking-request-cell {
    display: none;
  }
}

@media (max-width: 900px) {
  .ranking-head {
    flex-direction: column;
    gap: 18px;
  }

  .ranking-actions {
    width: 100%;
    justify-content: space-between;
    padding-top: 0;
  }

  .ranking-segment {
    flex: 1;
  }

  .ranking-segment-button {
    flex: 1;
  }

  .ranking-snapshot {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .ranking-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .ranking-head {
    padding-top: 0;
  }

  .ranking-title-lock {
    gap: 12px;
  }

  .ranking-title-icon {
    width: 42px;
    height: 42px;
  }

  .ranking-title-copy h1 {
    font-size: 26px;
  }

  .ranking-period-strip {
    align-items: flex-start;
    font-size: 11px;
  }

  .ranking-period-main {
    flex-wrap: wrap;
  }

  .ranking-source {
    padding-top: 2px;
  }

  .ranking-section-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .ranking-section-copy {
    text-align: left;
  }

  .ranking-podium-stage,
  .ranking-podium-stage.podium-count-1,
  .ranking-podium-stage.podium-count-2 {
    display: flex;
    align-items: stretch;
    flex-direction: column;
    gap: 9px;
    padding-top: 0;
  }

  .ranking-podium-card,
  .ranking-podium-card.rank-1,
  .ranking-podium-card.rank-2,
  .ranking-podium-card.rank-3 {
    min-height: 0;
  }

  .ranking-podium-card.rank-1 {
    order: -1;
  }

  .ranking-podium-card.rank-2 {
    order: 0;
  }

  .ranking-podium-card.rank-3 {
    order: 1;
  }

  .ranking-legend {
    display: none;
  }

  .ranking-detail-list {
    gap: 8px;
  }

  .ranking-detail-row {
    grid-template-areas:
      "rank user total"
      "rank progress progress";
    grid-template-columns: 34px minmax(0, 1fr) auto;
    gap: 8px 10px;
    min-height: 68px;
    padding: 11px 12px;
  }

  .ranking-rank-cell {
    grid-area: rank;
    align-self: start;
    padding-top: 2px;
  }

  .ranking-user-cell {
    grid-area: user;
  }

  .ranking-progress-cell {
    grid-area: progress;
  }

  .ranking-total-cell {
    grid-area: total;
    align-self: start;
    padding-top: 3px;
  }

  .ranking-request-cell {
    display: none;
  }

  .ranking-token-split {
    display: none;
  }

  .ranking-bar-row {
    gap: 8px;
  }

  .ranking-total-cell strong {
    font-size: 13px;
  }

  .ranking-total-cell span {
    display: none;
  }
}

@media (max-width: 520px) {
  .ranking-period-strip {
    flex-direction: column;
    gap: 7px;
  }

  .ranking-period-main {
    gap: 7px;
  }

  .ranking-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .ranking-refresh {
    width: 100%;
  }

  .ranking-podium-card,
  .ranking-podium-card.rank-1 {
    padding: 16px;
  }

  .ranking-podium-share {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .ranking-summary-grid {
    grid-template-columns: 1fr;
  }

  .ranking-summary-item {
    padding: 10px 12px;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .ranking-detail-row {
    animation: ranking-row-in 280ms both;
  }

  @keyframes ranking-row-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}
</style>
