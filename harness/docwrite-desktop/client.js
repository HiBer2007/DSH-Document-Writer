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
        routeHint: 'Host 路由 /docwrite/state 不可用，或没有找到已初始化项目的工作区；刷新后重试。',
        current: '当前',
        next: '下一阶段',
        approval: '待确认',
        blocked: '已阻断',
        updated: '更新于',
        done: '完成',
        noProject: '未选择项目',
        scope: '作用域',
        approvals: '确认',
        workspace: '工作区',
        archive: '归档',
        restore: '恢复',
        archived: '已归档',
        showArchived: '显示已归档',
        hideArchived: '隐藏已归档',
        archiveHint: '从面板隐藏，数据保留，可随时恢复',
        archiveFailed: '归档失败',
        allArchived: '活跃项目都已归档',
        allArchivedHint: '点右上角“显示已归档”查看并恢复。',
        disclaimer: '声明',
        checkUpdate: '检查更新',
        checkingUpdate: '检查中…',
        upToDate: '已是最新版本',
        updateAvailable: '发现新版本',
        currentVersion: '当前',
        latestVersion: '最新',
        openRelease: '打开 Release',
        updateFailed: '检查更新失败',
        close: '关闭',
      },
      en: {
        title: 'Doc Workshop',
        subtitle: '12-stage enforced pipeline · human rewrite · independent review · user gates',
        refresh: 'Refresh',
        loading: 'Reading the pipeline…',
        empty: 'No initialized project yet',
        emptyHint: 'Run docwrite init <name> in the conversation, or switch to the Doc Workshop preset.',
        error: 'Read failed',
        routeHint: 'The /docwrite/state Host route is unavailable, or no workspace has an initialized project; refresh and retry.',
        current: 'Current',
        next: 'Next',
        approval: 'Pending',
        blocked: 'Blocked',
        updated: 'Updated',
        done: 'done',
        noProject: 'No project',
        scope: 'Scope',
        approvals: 'Gates',
        workspace: 'Workspace',
        archive: 'Archive',
        restore: 'Restore',
        archived: 'Archived',
        showArchived: 'Show archived',
        hideArchived: 'Hide archived',
        archiveHint: 'Hide from the panel; data is kept and can be restored',
        archiveFailed: 'Archive failed',
        allArchived: 'All active projects are archived',
        allArchivedHint: 'Use “Show archived” at the top right to view and restore them.',
        disclaimer: 'Notice',
        checkUpdate: 'Check updates',
        checkingUpdate: 'Checking…',
        upToDate: 'Up to date',
        updateAvailable: 'New version',
        currentVersion: 'current',
        latestVersion: 'latest',
        openRelease: 'Open release',
        updateFailed: 'Update check failed',
        close: 'Close',
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
      headerActions: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flex: '0 0 auto',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
      },
      updateBanner: {
        marginTop: '14px',
        padding: '10px 14px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-1)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap',
        fontSize: '13px',
        color: 'var(--dsw-alias-label-primary)',
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

    function ProjectCard({ project, lang, onToggleArchive, busy }) {
      const t = T[lang]
      const stages = Array.isArray(project.stages) ? project.stages : []
      const done = stages.filter((stage) => stage.status === 'done' || stage.status === 'waived').length
      const percent = stages.length ? Math.round((done / stages.length) * 100) : 0
      const current = stages.find((stage) => stage.id === project.current)
      const next = stages.find((stage) => stage.id === project.next)
      return h(
        'section',
        { style: { ...S.card, opacity: project.archived ? 0.75 : 1 } },
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
          project.workspace
            ? h('span', { style: S.mono, title: project.workspace }, `${t.workspace} ${project.workspace}`)
            : null,
          project.archived
            ? h(
                'span',
                { style: { color: 'var(--dsw-alias-state-warn-primary)' } },
                `${t.archived}${project.archivedAt ? ` ${new Date(project.archivedAt).toLocaleString()}` : ''}`,
              )
            : null,
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
          h(
            'button',
            {
              type: 'button',
              style: { ...S.refresh, padding: '3px 10px', fontSize: '12px' },
              onClick: () => onToggleArchive(project),
              disabled: busy,
              title: t.archiveHint,
            },
            busy ? '…' : project.archived ? t.restore : t.archive,
          ),
        ),
      )
    }

    const DISCLAIMER_KEY = 'docwrite.disclaimer.v1.1.1'

    function showDisclaimer(force = false) {
      if (typeof document === 'undefined' || typeof window === 'undefined') return
      try {
        if (!force && localStorage.getItem(DISCLAIMER_KEY) === '1') return
      } catch {
        // 隐私模式下 localStorage 可能不可用；每次加载都提示。
      }
      if (document.querySelector('[data-docwrite-disclaimer]')) return

      const overlay = document.createElement('div')
      overlay.setAttribute('data-docwrite-disclaimer', '1')
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-modal', 'true')
      overlay.setAttribute('aria-label', '文档工坊使用声明')
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);' +
        'display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;'

      const card = document.createElement('div')
      card.style.cssText =
        'width:min(640px,100%);max-height:86vh;overflow:auto;box-sizing:border-box;' +
        'background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);' +
        'border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:14px;padding:24px 26px;' +
        'box-shadow:0 24px 80px rgba(0,0,0,.35);' +
        'font:14px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;'

      const title = document.createElement('h2')
      title.textContent = '文档工坊 · 使用声明'
      title.style.cssText = 'margin:0 0 4px;font-size:18px;line-height:1.4;font-weight:650;'

      const intro = document.createElement('p')
      intro.textContent = '首次使用前请阅读并确认：'
      intro.style.cssText = 'margin:0 0 8px;color:var(--dsw-alias-label-secondary,#666);font-size:13px;'

      const list = document.createElement('ol')
      list.style.cssText = 'margin:8px 0 10px 20px;padding:0;'
      for (const text of [
        '本项目仅用于学习与交流，不构成写作服务、学术成果、法律意见或任何形式的交付承诺。',
        '请勿用于学术用途：包括代写论文、课程作业、考试答卷、学位申请材料，以及任何违反学校、期刊、机构学术诚信规定的用途。',
        '请遵守所在国家/地区的法律法规、学校与机构规范及相关平台条款；不得伪造数据、抄袭、规避审查或实施其他违法行为。',
        '因使用或滥用本项目造成的后果由使用者自行承担；作者与贡献者不承担责任。',
      ]) {
        const item = document.createElement('li')
        item.textContent = text
        item.style.margin = '4px 0'
        list.appendChild(item)
      }

      const install = document.createElement('p')
      install.textContent =
        '首次安装提示：用绝对路径安装 bundle → 刷新页面 → 新建会话选择「文档工坊」→ ' +
        '空工作区先运行 docwrite_init。若工作模式菜单没有「文档工坊」，访问 ' +
        '/docwrite/presets 确认 broken 为 null，再重载 bundle。'
      install.style.cssText =
        'margin:10px 0;padding:10px 12px;border-radius:8px;' +
        'background:var(--dsw-alias-bg-layer-2,#f6f6f6);' +
        'color:var(--dsw-alias-label-secondary,#555);font-size:13px;'

      const neutral = document.createElement('p')
      neutral.textContent =
        '本声明面向使用者，不影响工具的正常文档写作功能；确认后照常使用。'
      neutral.style.cssText =
        'margin:8px 0 0;color:var(--dsw-alias-label-secondary,#666);font-size:13px;'

      const english = document.createElement('p')
      english.textContent =
        'For learning and exchange only. Do not use for academic purposes. ' +
        'Comply with applicable laws and institutional policies. Use at your own risk.'
      english.style.cssText = 'margin:8px 0 0;color:var(--dsw-alias-label-secondary,#777);font-size:12px;'

      const link = document.createElement('a')
      link.href = 'https://github.com/HiBer2007/DSH-Document-Writer/blob/main/DISCLAIMER.md'
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.textContent = '查看完整声明与 README'
      link.style.cssText = 'display:inline-block;margin-top:10px;color:var(--dsw-alias-brand-primary,#2563eb);'

      const actions = document.createElement('div')
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap;'

      const close = () => {
        document.removeEventListener('keydown', onKey)
        overlay.remove()
      }
      const onKey = (event) => {
        if (event.key === 'Escape') close()
      }

      const ack = document.createElement('button')
      ack.type = 'button'
      ack.textContent = '我已知悉并同意'
      ack.style.cssText =
        'border:1px solid #1d4ed8;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px;' +
        'font-weight:600;background:#1d4ed8;color:#fff;'
      ack.onclick = () => {
        try {
          localStorage.setItem(DISCLAIMER_KEY, '1')
        } catch {
          // 写不进去也不阻塞关闭。
        }
        close()
      }

      const later = document.createElement('button')
      later.type = 'button'
      later.textContent = '暂不使用'
      later.style.cssText =
        'border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;padding:8px 16px;' +
        'cursor:pointer;font-size:14px;background:transparent;color:var(--dsw-alias-label-primary,#111);'
      later.onclick = close

      actions.append(ack, later)
      card.append(title, intro, list, install, neutral, english, link, actions)
      overlay.appendChild(card)
      document.body.appendChild(overlay)
      document.addEventListener('keydown', onKey)
      ack.focus()
    }

    function makePanel(ctx) {
      return function Panel(props) {
        const lang = useLang(ctx)
        const t = T[lang]
        const { data, error, refresh } = useSnapshot()
        const projects = Array.isArray(data?.projects) ? data.projects : []
        const [showArchived, setShowArchived] = React.useState(false)
        const [busyKey, setBusyKey] = React.useState(null)
        const [actionError, setActionError] = React.useState(null)
        const [updateInfo, setUpdateInfo] = React.useState(null)
        const [checkingUpdate, setCheckingUpdate] = React.useState(false)
        const archivedCount = projects.filter((project) => project.archived).length
        const visible = showArchived ? projects : projects.filter((project) => !project.archived)

        const checkForUpdate = async () => {
          setCheckingUpdate(true)
          setUpdateInfo(null)
          try {
            const response = await fetch('/docwrite/update', {
              cache: 'no-store',
              headers: { accept: 'application/json' },
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            setUpdateInfo(await response.json())
          } catch (err) {
            setUpdateInfo({ ok: false, error: err?.message ?? String(err) })
          } finally {
            setCheckingUpdate(false)
          }
        }

        const toggleArchive = async (project) => {
          const key = `${project.workspace ?? ''}:${project.project}`
          setBusyKey(key)
          setActionError(null)
          try {
            const response = await fetch('/docwrite/archive', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                root: project.workspace,
                project: project.project,
                archived: !project.archived,
              }),
            })
            if (!response.ok) {
              const payload = await response.json().catch(() => ({}))
              throw new Error(payload.error ?? `HTTP ${response.status}`)
            }
            refresh()
          } catch (err) {
            setActionError(err?.message ?? String(err))
          } finally {
            setBusyKey(null)
          }
        }
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
              'div',
              { style: S.headerActions },
              h(
                'button',
                {
                  type: 'button',
                  style: S.refresh,
                  onClick: checkForUpdate,
                  disabled: checkingUpdate,
                },
                checkingUpdate ? t.checkingUpdate : t.checkUpdate,
              ),
              h(
                'button',
                {
                  type: 'button',
                  style: S.refresh,
                  onClick: () => showDisclaimer(true),
                },
                t.disclaimer,
              ),
              archivedCount > 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      style: S.refresh,
                      onClick: () => setShowArchived((value) => !value),
                    },
                    showArchived ? t.hideArchived : `${t.showArchived} (${archivedCount})`,
                  )
                : null,
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
          ),
          error
            ? h(
                'div',
                { style: S.error },
                h('div', null, `${t.error}：${error}`),
                h('div', { style: { marginTop: '4px', opacity: 0.85 } }, t.routeHint),
              )
            : null,
          actionError
            ? h('div', { style: S.error }, `${t.archiveFailed}：${actionError}`)
            : null,
          updateInfo
            ? h(
                'div',
                { style: S.updateBanner },
                h(
                  'span',
                  null,
                  updateInfo.ok
                    ? updateInfo.updateAvailable
                      ? `${t.updateAvailable} ${updateInfo.tag}（${t.currentVersion} ${updateInfo.current}）`
                      : `${t.upToDate}（${updateInfo.current}）`
                    : `${t.updateFailed}：${updateInfo.error ?? 'unknown'}`,
                ),
                updateInfo.url
                  ? h(
                      'a',
                      {
                        href: updateInfo.url,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        style: { color: 'inherit', textDecoration: 'underline' },
                      },
                      t.openRelease,
                    )
                  : null,                h(
                  'button',
                  {
                    type: 'button',
                    style: { ...S.refresh, padding: '3px 10px', fontSize: '12px', marginLeft: 'auto' },
                    onClick: () => setUpdateInfo(null),
                  },
                  t.close,
                ),
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
          data && projects.length > 0 && visible.length === 0
            ? h(
                'div',
                { style: S.empty },
                h('div', { style: { fontSize: '15px', color: 'var(--dsw-alias-label-primary)' } }, t.allArchived),
                h('div', { style: { marginTop: '6px' } }, t.allArchivedHint),
              )
            : null,
          visible.length
            ? h(
                'div',
                { style: S.grid },
                visible.map((project) =>
                  h(ProjectCard, {
                    key: `${project.workspace ?? ''}:${project.project}`,
                    project,
                    lang,
                    onToggleArchive: toggleArchive,
                    busy: busyKey === `${project.workspace ?? ''}:${project.project}`,
                  }),
                ),
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
        if (typeof document !== 'undefined') {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => showDisclaimer(), { once: true })
          } else {
            showDisclaimer()
          }
        }
      },
    }
  },
})
