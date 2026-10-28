import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRuntime } from '../../core'
import type { BrickDef, LevelDesign } from '../../core/contracts'
import { activeQuestion } from '../../core/sensing'
import { AskDialog } from './AskDialog'

afterEach(() => {
  cleanup()
})

function makeAskingDesign(): LevelDesign {
  const brick: BrickDef = {
    id: 'b1',
    name: 'Asker',
    costumes: [],
    sounds: [],
    program: {
      scripts: [
        {
          id: 's1',
          hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
          body: [
            {
              opcode: 'sensing_askandwait',
              fields: {},
              inputs: { QUESTION: { kind: 'lit', value: 'What is your name?' } },
            },
          ],
        },
      ],
      procedures: [],
      variables: [],
      lists: [],
    },
  }

  return {
    id: 'lvl',
    name: 'Lvl',
    bounds: { left: 0, right: 960, bottom: 0, top: 360 },
    stage: {
      id: 'stage',
      name: 'Stage',
      costumes: [],
      sounds: [],
      program: { scripts: [], procedures: [], variables: [], lists: [] },
    },
    bricks: [brick],
    copies: [{ id: 'c1', brickId: 'b1', x: 100, y: 100 }],
    seed: 1,
  }
}

describe('AskDialog', () => {
  it('displays the question and picked answer chips, and submits the chosen answer', () => {
    const runtime = createRuntime(makeAskingDesign())
    runtime.greenFlag()
    runtime.step()

    const prompt = activeQuestion(runtime.world)
    expect(prompt).not.toBeNull()
    if (!prompt) return
    expect(prompt.question).toBe('What is your name?')

    render(<AskDialog runtime={runtime} prompt={prompt} />)

    expect(screen.getByText('What is your name?')).toBeTruthy()
    // Check chips
    expect(screen.getByRole('button', { name: 'Answer Yes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Answer Hero' })).toBeTruthy()

    // Clicking 'Hero' chip submits answer 'Hero'
    const heroChip = screen.getByRole('button', { name: 'Answer Hero' })
    fireEvent.click(heroChip)

    // The answer in runtime world is now 'Hero'
    expect(runtime.world.answer).toBe('Hero')
    // Active question should now be cleared
    expect(activeQuestion(runtime.world)).toBeNull()
  })

  it('submits typed or custom answers via text field', () => {
    const runtime = createRuntime(makeAskingDesign())
    runtime.greenFlag()
    runtime.step()

    const prompt = activeQuestion(runtime.world)
    expect(prompt).not.toBeNull()
    if (!prompt) return

    render(<AskDialog runtime={runtime} prompt={prompt} />)

    const input = screen.getByRole('textbox', { name: 'Answer text' })
    fireEvent.change(input, { target: { value: '42' } })

    const submitBtn = screen.getByRole('button', { name: 'Submit answer' })
    fireEvent.click(submitBtn)

    expect(runtime.world.answer).toBe('42')
  })
})
