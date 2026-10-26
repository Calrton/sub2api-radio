import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
  getUserRanking,
  type UserRankingParams,
  type UserRankingPeriod,
  type UserRankingResponse
} from '@/api/usage'
import UserRankingView from '../UserRankingView.vue'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/api/client', () => ({ apiClient: { get } }))

vi.mock('@/utils/format', async () => {
  const actual = await vi.importActual<typeof import('@/utils/format')>('@/utils/format')
  return {
    ...actual,
    getBrowserTimeZone: () => 'Asia/Shanghai'
  }
})

const messages: Record<string, string> = {
  'common.refresh': 'Refresh',
  'common.unknown': 'Unknown',
  'userRanking.title': 'User Ranking',
  'userRanking.description': "View today's compute ranking by total tokens.",
  'userRanking.eyebrow': 'XIHE LEADERBOARD',
  'userRanking.rankByTokens': 'Ranked by total tokens',
  'userRanking.dataSource': 'Live data',
  'userRanking.podiumKicker': 'TOP PERFORMERS',
  'userRanking.podiumTitle': 'Leading Users',
  'userRanking.podiumDescription': 'The three highest-usage users this period.',
  'userRanking.champion': 'Champion',
  'userRanking.runnerUp': 'Runner-up',
  'userRanking.thirdPlace': 'Third Place',
  'userRanking.daily': 'Daily',
  'userRanking.weekly': 'Weekly',
  'userRanking.dateRange': 'Date range',
  'userRanking.rank': 'Rank',
  'userRanking.email': 'User email',
  'userRanking.requests': 'Requests',
  'userRanking.requestCount': 'requests',
  'userRanking.topShare': 'Top share',
  'userRanking.relativeToLeader': 'vs. leader',
  'userRanking.fullRankingKicker': 'FULL RANKING',
  'userRanking.fullRanking': 'Full Ranking',
  'userRanking.tokenComposition': 'Token composition',
  'userRanking.activeUser': 'Active user',
  'userRanking.requestsUnit': 'requests',
  'userRanking.inputShort': 'Input',
  'userRanking.outputShort': 'Output',
  'userRanking.cacheShort': 'Cache',
  'userRanking.snapshotKicker': 'PERIOD SNAPSHOT',
  'userRanking.snapshotTitle': 'Period Overview',
  'userRanking.rankedUsers': 'Ranked users',
  'userRanking.totalRequests': 'Period requests',
  'userRanking.topTokens': 'Top tokens',
  'userRanking.leaderShare': 'Leader share',
  'userRanking.inputTokens': 'Input Tokens',
  'userRanking.outputTokens': 'Output Tokens',
  'userRanking.cacheTokens': 'Cache Tokens',
  'userRanking.totalTokens': 'Total Tokens',
  'userRanking.loading': 'Loading ranking data...',
  'userRanking.loadFailed': 'Failed to load ranking data. Please try again later.',
  'userRanking.retry': 'Try again',
  'userRanking.empty': 'No ranking data',
  'userRanking.emptyDescription': 'No user usage has been recorded for this period.'
}

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => messages[key] ?? key
    })
  }
})

const AppLayoutStub = { template: '<main><slot /></main>' }

function response(period: UserRankingPeriod): UserRankingResponse {
  return {
    ranking: [
      {
        email: `${period}-1@example.com`,
        requests: 420,
        input_tokens: 412_345,
        output_tokens: 82_345,
        cache_tokens: 51_000,
        total_tokens: 145_000_000
      },
      {
        email: `${period}-2@example.com`,
        requests: 310,
        input_tokens: 302_345,
        output_tokens: 52_345,
        cache_tokens: 41_000,
        total_tokens: 395_690
      },
      {
        email: `${period}-3@example.com`,
        requests: 210,
        input_tokens: 202_345,
        output_tokens: 32_345,
        cache_tokens: 21_000,
        total_tokens: 255_690
      },
      {
        email: `${period}-4@example.com`,
        requests: 120,
        input_tokens: 102_345,
        output_tokens: 12_345,
        cache_tokens: 11_000,
        total_tokens: 125_690
      }
    ],
    start_date: period === 'daily' ? '2026-10-19' : '2026-10-13',
    end_date: '2026-10-19'
  }
}

function mountView() {
  return mount(UserRankingView, {
    global: {
      stubs: {
        AppLayout: AppLayoutStub,
        Icon: true
      }
    }
  })
}

describe('UserRankingView', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('requests the ranking endpoint with the exact API parameters', async () => {
    const payload = response('weekly')
    get.mockResolvedValue({ data: payload })

    await expect(
      getUserRanking({ period: 'weekly', limit: 20, timezone: 'Asia/Shanghai' })
    ).resolves.toEqual(payload)
    expect(get).toHaveBeenCalledWith('/usage/users-ranking', {
      params: {
        period: 'weekly',
        limit: 20,
        timezone: 'Asia/Shanghai'
      }
    })
  })

  it('loads daily by default, switches to weekly, and refreshes the current period', async () => {
    get.mockImplementation(async (_path: string, config: { params: UserRankingParams }) => ({
      data: response(config.params.period)
    }))

    const wrapper = mountView()
    await flushPromises()

    expect(get).toHaveBeenNthCalledWith(1, '/usage/users-ranking', {
      params: { period: 'daily', limit: 20, timezone: 'Asia/Shanghai' }
    })
    expect(wrapper.get('[data-testid="user-ranking-date-range"]').text()).toBe('2026-10-19 - 2026-10-19')
    expect(wrapper.get('[data-testid="user-ranking-podium"]').text()).toContain('daily-1@example.com')
    expect(wrapper.get('[data-testid="user-ranking-list"]').text()).toContain('daily-4@example.com')

    await wrapper.get('[data-testid="user-ranking-period-weekly"]').trigger('click')
    await flushPromises()

    expect(get).toHaveBeenNthCalledWith(2, '/usage/users-ranking', {
      params: { period: 'weekly', limit: 20, timezone: 'Asia/Shanghai' }
    })
    expect(wrapper.get('[data-testid="user-ranking-date-range"]').text()).toBe('2026-10-13 - 2026-10-19')
    expect(wrapper.get('[data-testid="user-ranking-podium"]').text()).toContain('weekly-1@example.com')
    expect(wrapper.get('[data-testid="user-ranking-list"]').text()).toContain('weekly-4@example.com')

    await wrapper.get('[data-testid="user-ranking-refresh"]').trigger('click')
    await flushPromises()

    expect(get).toHaveBeenNthCalledWith(3, '/usage/users-ranking', {
      params: { period: 'weekly', limit: 20, timezone: 'Asia/Shanghai' }
    })
  })

  it('renders the podium and the remaining ranking rows', async () => {
    let resolveRequest!: (value: { data: UserRankingResponse }) => void
    get.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve
    }))

    const wrapper = mountView()
    await nextTick()

    expect(wrapper.find('[data-testid="user-ranking-loading"]').exists()).toBe(true)

    resolveRequest({ data: response('daily') })
    await flushPromises()

    const podiumCards = wrapper.findAll('[data-testid="user-ranking-podium-card"]')
    expect(podiumCards).toHaveLength(3)
    expect(podiumCards.map((card) => card.text())).toEqual([
      expect.stringContaining('daily-2@example.com'),
      expect.stringContaining('daily-1@example.com'),
      expect.stringContaining('daily-3@example.com')
    ])

    const rows = wrapper.findAll('[data-testid="user-ranking-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('daily-4@example.com')
    expect(rows[0].text()).toContain('12.6万')
    expect(podiumCards[1].text()).toContain('1.4亿')
    expect(podiumCards[1].text()).not.toContain('M')
    expect(wrapper.find('[data-testid="user-ranking-table"]').exists()).toBe(false)
  })

  it('shows the error state and retries the request', async () => {
    get.mockRejectedValueOnce(new Error('network unavailable'))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="user-ranking-error"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="user-ranking-error"]').text()).toContain(
      'Failed to load ranking data. Please try again later.'
    )

    get.mockResolvedValueOnce({ data: response('daily') })
    await wrapper.get('[data-testid="user-ranking-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="user-ranking-podium"]').exists()).toBe(true)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('shows the empty state when the ranking has no users', async () => {
    get.mockResolvedValue({
      data: {
        ranking: [],
        start_date: '2026-10-19',
        end_date: '2026-10-19'
      }
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="user-ranking-empty"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="user-ranking-empty"]').text()).toContain('No ranking data')
    expect(wrapper.find('[data-testid="user-ranking-podium"]').exists()).toBe(false)
  })
})
