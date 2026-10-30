// 文档工坊 Client 插件（DSH Desktop Web GUI）
//
// 在左侧栏注册一个面板图标，在 main 键控槽注册「文档工坊」面板；
// 面板每 4 秒读取 Host 的 /docwrite/state 快照，只读展示 12 阶段进度、待确认点与阻断原因。
window.__ModuleLoader__.load({
  id: '@local/dsh-docwrite',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const T = {
      zh: {
        title: '文档工坊',
        subtitle: '12 阶段强制流水线 · 人工降重 · 独立评审 · 用户确认点',
        refresh: '刷新',
        loading: '正在读取流水线…',
        empty: '还没有已初始化项目',
        emptyHint: '在对话里运行 docwrite init <项目名>，或切换到「文档工坊」预设开始。',
        error: '读取失败',
        routeHint: 'Host 路由 /docwrite/state 不可用；确认插件已启用并重启 Desktop。',
        current: '当前',
        next: '下一阶段',
        approval: '待确认',
        blocked: '已阻断',
        updated: '更新于',
        done: '完成',
        noProject: '未选择项目',
        scope: '作用域',
        approvals: '确认',
      },
      en: {
        title: 'Doc Workshop',
        subtitle: '12-stage enforced pipeline · human rewrite · independent review · user gates',
        refresh: 'Refresh',
        loading: 'Reading the pipeline…',
        empty: 'No initialized project yet',
        emptyHint: 'Run docwrite init <name> in the conversation, or switch to the Doc Workshop preset.',
        error: 'Read failed',
        routeHint: 'The /docwrite/state Host route is unavailable; enable the plugin and restart Desktop.',
        current: 'Current',
        next: 'Next',
        approval: 'Pending',
        blocked: 'Blocked',
        updated: 'Updated',
        done: 'done',
        noProject: 'No project',
        scope: 'Scope',
        approvals: 'Gates',
      },
    }

    const STATUS_COLOR = {
      done: 'var(--dsw-alias-state-success-primary)',
      active: 'var(--dsw-alias-brand-primary)',
      pending: 'var(--dsw-alias-state-idle-primary)',
      waived: 'var(--dsw-alias-state-warn-primary)',
      excluded: 'var(--dsw-alias-state-idle-primary)',
      blocked: 'var(--dsw-alias-state-error-primary)',
      failed: 'var(--dsw-alias-state-error-primary)',
    }

    const S = {
      page: {
        height: '100%',
        overflow: 'auto',
        boxSizing: 'border-box',
        padding: '28px 32px 40px',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit',
      },
      header: {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '16px',
      },
      title: { margin: 0, fontSize: '22px', fontWeight: 650, letterSpacing: '0.01em' },
      subtitle: {
        marginTop: '6px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '13px',
        lineHeight: 1.5,
      },
      refresh: {
        flex: '0 0 auto',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: '8px',
        padding: '6px 14px',
        fontSize: '13px',
        cursor: 'pointer',
      },
      grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
        gap: '16px',
        marginTop: '22px',
      },
      card: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: '12px',
        padding: '16px 18px 14px',
        minWidth: 0,
      },
      cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
      project: { fontSize: '16px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' },
      badge: {
        flex: '0 0 auto',
        border: '1px solid var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-brand-primary)',
        borderRadius: '999px',
        padding: '2px 10px',
        fontSize: '12px',
        whiteSpace: 'nowrap',
      },
      meta: {
        marginTop: '8px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 14px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '12px',
      },
      track: {
        marginTop: '12px',
        height: '6px',
        borderRadius: '999px',
        background: 'var(--dsw-alias-bg-layer-2)',
        overflow: 'hidden',
      },
      fill: {
        height: '100%',
        borderRadius: '999px',
        background: 'var(--dsw-alias-brand-primary)',
        transition: 'width 240ms ease',
      },
      stages: {
        marginTop: '14px',
        display: 'grid',
        gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
        gap: '4px',
      },
      stageCell: {
        minWidth: 0,
        borderRadius: '6px',
        border: '1px solid',
        padding: '4px 2px 5px',
        textAlign: 'center',
        fontSize: '10px',
        lineHeight: 1.25,
      },
      stageId: { fontWeight: 650, fontSize: '10px' },
      stageName: {
        marginTop: '1px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: 0.9,
      },
      note: {
        marginTop: '12px',
        borderRadius: '8px',
        padding: '8px 10px',
        fontSize: '12px',
        lineHeight: 1.5,
        border: '1px solid',
      },
      footer: {
        marginTop: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '12px',
      },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
      empty: {
        marginTop: '28px',
        border: '1px dashed var(--dsw-alias-border-l2)',
        borderRadius: '12px',
        padding: '28px',
        textAlign: 'center',
        color: 'var(--dsw-alias-label-secondary)',
      },
      error: {
        marginTop: '18px',
        border: '1px solid var(--dsw-alias-state-error-primary)',
        color: 'var(--dsw-alias-state-error-primary)',
        borderRadius: '10px',
        padding: '10px 12px',
        fontSize: '13px',
        lineHeight: 1.5,
      },
    }

    function useLang(ctx) {
      const service = ctx.get('locale')
      const [, setRevision] = React.useState(0)
      React.useEffect(() => {
        if (!service || typeof service.subscribe !== 'function') return undefined
        return service.subscribe(() => setRevision((value) => value + 1))
      }, [service])
      let active = 'zh'
      try {
        active = service?.getLocale?.().active ?? 'zh'
      } catch {
        active = 'zh'
      }
      return active.toLowerCase().startsWith('en') ? 'en' : 'zh'
    }

    function useSnapshot() {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [revision, setRevision] = React.useState(0)
      React.useEffect(() => {
        let alive = true
        let timer = null
        const load = async () => {
          try {
            const response = await fetch('/docwrite/state', {
              cache: 'no-store',
              headers: { accept: 'application/json' },
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const value = await response.json()
            if (alive) {
              setData(value)
              setError(null)
            }
          } catch (err) {
            if (alive) setError(err?.message ?? String(err))
          }
        }
        load()
        timer = setInterval(load, 4000)
        return () => {
          alive = false
          if (timer !== null) clearInterval(timer)
        }
      }, [revision])
      return { data, error, refresh: () => setRevision((value) => value + 1) }
    }

    function PanelIcon(props) {
      const size = props?.size ?? 20
      const active = Boolean(props?.active)
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          'aria-hidden': true,
          style: { display: 'block', color: 'currentColor' },
        },
        h('path', {
          d: 'M6.5 3.5h7l4 4v13h-11z',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinejoin: 'round',
          opacity: active ? 1 : 0.82,
        }),
        h('path', {
          d: 'M13.5 3.5v4.5h4',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinejoin: 'round',
          opacity: active ? 1 : 0.82,
        }),
        h('path', {
          d: 'M9 13.2l2 2 4-4.4',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function StageChip({ stage }) {
      const color = STATUS_COLOR[stage.status] ?? STATUS_COLOR.pending
      const excluded = stage.status === 'excluded'
      return h(
        'div',
        {
          title: `${stage.id} ${stage.name} · ${stage.status}${stage.stale ? ' · stale' : ''}`,
          style: {
            ...S.stageCell,
            borderColor: color,
            color,
            background: 'transparent',
            opacity: excluded ? 0.55 : 1,
          },
        },
        h('div', { style: S.stageId }, stage.id),
        h('div', { style: S.stageName }, stage.name),
      )
    }

    function ProjectCard({ project, lang }) {
      const t = T[lang]
      const stages = Array.isArray(project.stages) ? project.stages : []
      const done = stages.filter((stage) => stage.status === 'done' || stage.status === 'waived').length
      const percent = stages.length ? Math.round((done / stages.length) * 100) : 0
      const current = stages.find((stage) => stage.id === project.current)
      const next = stages.find((stage) => stage.id === project.next)
      return h(
        'section',
        { style: S.card },
        h(
          'div',
          { style: S.cardHead },
          h('div', { style: S.project }, project.project ?? t.noProject),
          h(
            'div',
            { style: S.badge },
            project.current ? `${project.current}${current ? ` ${current.name}` : ''}` : t.noProject,
          ),
        ),
        h(
          'div',
          { style: S.meta },
          h('span', null, `${t.scope} ${project.scope?.mode ?? 'full'}`),
          h('span', null, `${t.approvals} ${(project.approvals ?? []).join(' ') || '—'}`),
          project.updatedAt
            ? h('span', null, `${t.updated} ${new Date(project.updatedAt).toLocaleString()}`)
            : null,
        ),
        h('div', { style: S.track }, h('div', { style: { ...S.fill, width: `${percent}%` } })),
        project.pendingApproval
          ? h(
              'div',
              {
                style: {
                  ...S.note,
                  borderColor: 'var(--dsw-alias-state-warn-primary)',
                  color: 'var(--dsw-alias-state-warn-primary)',
                },
              },
              `${t.approval} ${project.pendingApproval.gate}：${project.pendingApproval.question}`,
            )
          : null,
        project.blocked
          ? h(
              'div',
              {
                style: {
                  ...S.note,
                  borderColor: 'var(--dsw-alias-state-error-primary)',
                  color: 'var(--dsw-alias-state-error-primary)',
                },
              },
              `${t.blocked}：${project.blocked.reason}`,
            )
          : null,
        h('div', { style: S.stages }, stages.map((stage) => h(StageChip, { key: stage.id, stage }))),
        h(
          'div',
          { style: S.footer },
          h('span', null, `${t.done} ${done}/${stages.length || 12}`),
          h(
            'span',
            { style: S.mono },
            next ? `${t.next} ${next.id} ${next.name}` : project.next ? `${t.next} ${project.next}` : '—',
          ),
        ),
      )
    }

    function makePanel(ctx) {
      return function Panel() {
        const lang = useLang(ctx)
        const t = T[lang]
        const { data, error, refresh } = useSnapshot()
        const projects = Array.isArray(data?.projects) ? data.projects : []
        return h(
          'div',
          { style: S.page },
          h(
            'div',
            { style: S.header },
            h(
              'div',
              null,
              h('h1', { style: S.title }, t.title),
              h('div', { style: S.subtitle }, t.subtitle),
            ),
            h(
              'button',
              {
                type: 'button',
                style: S.refresh,
                onClick: refresh,
                'aria-label': t.refresh,
              },
              t.refresh,
            ),
          ),
          error
            ? h(
                'div',
                { style: S.error },
                h('div', null, `${t.error}：${error}`),
                h('div', { style: { marginTop: '4px', opacity: 0.85 } }, t.routeHint),
              )
            : null,
          !data && !error ? h('div', { style: S.empty }, t.loading) : null,
          data && projects.length === 0
            ? h(
                'div',
                { style: S.empty },
                h('div', { style: { fontSize: '15px', color: 'var(--dsw-alias-label-primary)' } }, t.empty),
                h('div', { style: { marginTop: '6px' } }, t.emptyHint),
              )
            : null,
          projects.length
            ? h(
                'div',
                { style: S.grid },
                projects.map((project) => h(ProjectCard, { key: project.project, project, lang })),
              )
            : null,
        )
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const label = () => (ctx.get('locale')?.getLocale?.().active ?? 'zh').toLowerCase().startsWith('en')
          ? 'Doc Workshop'
          : '文档工坊'
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'docwrite', order: 20, label },
            PanelIcon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'docwrite' }, makePanel(ctx)),
        )
      },
    }
  },
})
