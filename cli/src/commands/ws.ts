import { loadAll } from '../api/store'
import { c, sym } from '../ui/colors'
import { divider, section } from '../ui/box'
import { table } from '../ui/table'
import { resolveWorkspace } from '../api/resolve'
import { writeConfig, readConfigAsync } from '../config/daemon'

export async function wsList(asJson = false): Promise<void> {
  const { workspaces, cards, activeWsId } = await loadAll()
  const cliState = await readConfigAsync()
  const activeSlug = cliState.activeWorkspaceSlug

  if (asJson) {
    console.log(JSON.stringify(workspaces, null, 2))
    return
  }

  console.log(divider('WORKSPACES', 'gray'))
  console.log()

  if (workspaces.length === 0) {
    console.log(c.dim('  nenhum workspace criado.'))
    console.log(c.dim('  crie pelo web UI ou: cockpit ws new <name>'))
    return
  }

  const rows = workspaces.map((w, i) => {
    const wsCards = cards.filter((c) => c.workspace_id === w.id)
    const inProgress = wsCards.filter((c) => c.spec_status === 'in_progress').length
    const review = wsCards.filter((c) => c.spec_status === 'review').length
    const isActiveCli = w.slug === activeSlug
    const isActiveUi = w.id === activeWsId
    const marker = isActiveCli ? c.emerald('▸') : isActiveUi ? c.cyan('▹') : ' '

    return {
      idx: c.dim(String(i + 1).padStart(2, '0')),
      marker,
      name: c.bold(w.name),
      slug: c.dim('#' + w.slug),
      cards: c.gray(`${wsCards.length} cards`),
      activity: [
        inProgress > 0 ? c.amber(`${inProgress} wip`) : '',
        review > 0 ? c.cyan(`${review} review`) : '',
      ].filter(Boolean).join(' ') || c.dim('—'),
    }
  })

  console.log(table(rows, [
    { key: 'idx', label: '' },
    { key: 'marker', label: '' },
    { key: 'name', label: 'name' },
    { key: 'slug', label: 'slug' },
    { key: 'cards', label: 'cards', align: 'right' },
    { key: 'activity', label: 'activity' },
  ]))

  console.log()
  if (activeSlug) {
    console.log(c.dim(`  ${sym.bullet} CLI ativo: ${c.emerald(activeSlug)}`))
  }
  console.log(c.dim(`  ${sym.bullet} use: ${c.bold('cockpit ws use <name>')} para mudar`))
  console.log(c.dim(`  ${sym.bullet} ${c.bold('cockpit board')} para ver kanban do ativo`))
}

export async function wsUse(ref: string): Promise<void> {
  const { workspaces } = await loadAll()
  const ws = resolveWorkspace(ref, workspaces)
  if (!ws) {
    console.error(c.rose('✕ workspace nao encontrado: ') + ref)
    console.log(c.dim('  use ' + c.bold('cockpit ws') + ' para listar'))
    process.exit(1)
  }
  await writeConfig({ activeWorkspaceSlug: ws.slug })
  console.log(`${c.emerald('✓')} workspace ativo: ${c.bold(ws.name)} ${c.dim('#' + ws.slug)}`)
}

export async function wsInfo(ref?: string): Promise<void> {
  const { workspaces, cards, columns, projects } = await loadAll()
  const cliState = await readConfigAsync()

  let target = ref
    ? resolveWorkspace(ref, workspaces)
    : workspaces.find((w) => w.slug === cliState.activeWorkspaceSlug)

  if (!target) {
    console.error(c.rose('✕ workspace ativo nao definido'))
    console.log(c.dim('  use: cockpit ws use <name>'))
    process.exit(1)
  }

  const wsCards = cards.filter((c) => c.workspace_id === target!.id)
  const wsCols = columns[target.id] || []
  const wsProjects = projects.filter((p) => p.workspace_id === target!.id)

  console.log(divider(`WORKSPACE · ${target.name.toUpperCase()}`, 'cyan'))
  console.log()

  console.log(section('Identificacao'))
  console.log(`  ${c.dim('id')}      ${target.id}`)
  console.log(`  ${c.dim('slug')}    ${c.bold(target.slug)}`)
  console.log(`  ${c.dim('cor')}     ${target.color}`)
  if (target.description) console.log(`  ${c.dim('desc')}    ${target.description}`)
  console.log()

  console.log(section('Stats'))
  console.log(`  ${c.dim('cards')}   ${c.bold(String(wsCards.length))}`)
  console.log(`  ${c.dim('cols')}    ${c.bold(String(wsCols.length))}`)
  console.log(`  ${c.dim('proj')}    ${c.bold(String(wsProjects.length))}`)
  console.log()

  if (wsProjects.length > 0) {
    console.log(section('Projetos'))
    for (const p of wsProjects) {
      const path = p.path.replace(/^\/Users\/[^/]+\//, '~/')
      console.log(`  ${sym.bullet} ${c.bold(p.name)} ${c.dim(path)}`)
    }
    console.log()
  }
}
