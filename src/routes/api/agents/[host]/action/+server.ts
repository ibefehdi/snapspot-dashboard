import { error, json } from '@sveltejs/kit'
import { z } from 'zod'
import { assertValidHost } from '$lib/server/config'
import { sshExec } from '$lib/server/ssh'

const actionSchema = z.object({
  action: z.enum(['restart-app', 'restart-ustreamer', 'reboot']),
})

const ACTION_COMMANDS: Record<string, string> = {
  'restart-app': 'sudo systemctl restart cage-tty1',
  'restart-ustreamer': 'sudo systemctl restart ustreamer',
  'reboot': 'sudo systemctl reboot',
}

export async function POST({ params, request }) {
  try {
    assertValidHost(params.host)
  }
  catch {
    throw error(400, 'Invalid hostname')
  }

  const body = await request.json().catch(() => null)
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    throw error(400, 'Invalid action')
  }

  const command = ACTION_COMMANDS[parsed.data.action]
  const { stdout, stderr, code } = await sshExec(params.host, command)

  if (code !== 0) {
    return json({
      ok: false,
      message: stderr.trim() || stdout.trim() || `Command failed with code ${code}`,
    }, { status: 502 })
  }

  return json({ ok: true, message: stdout.trim() || 'Action completed' })
}
