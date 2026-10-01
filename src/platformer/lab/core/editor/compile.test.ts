import { describe, expect, it } from 'vitest'
import { compileWorkspace, type WorkspaceJson } from './compile'

describe('Compiler: Blockly Workspace JSON -> BrickProgram IR', () => {
  // ---------------------------------------------------------------------------
  // 1. Motion
  // ---------------------------------------------------------------------------
  it('compiles Motion blocks and numeric shadow literals', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [
          {
            type: 'event_whenflagclicked',
            id: 'hat_flag',
            next: {
              block: {
                type: 'motion_movesteps',
                id: 'move_1',
                inputs: {
                  STEPS: {
                    shadow: {
                      type: 'math_number',
                      fields: { NUM: 10 },
                    },
                  },
                },
                next: {
                  block: {
                    type: 'motion_gotoxy',
                    id: 'goto_xy',
                    inputs: {
                      X: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
                      Y: { shadow: { type: 'math_number', fields: { NUM: -50 } } },
                    },
                    next: {
                      block: {
                        type: 'motion_pointtowards',
                        id: 'point_mouse',
                        fields: { TOWARDS: '_mouse_' },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)
    expect(program.scripts).toHaveLength(1)

    const script = program.scripts[0]
    expect(script.id).toBe('hat_flag')
    expect(script.hat.opcode).toBe('event_whenflagclicked')
    expect(script.body).toHaveLength(3)

    expect(script.body[0]).toEqual({
      id: 'move_1',
      opcode: 'motion_movesteps',
      fields: {},
      inputs: {
        STEPS: { kind: 'lit', value: 10 },
      },
    })

    expect(script.body[1]).toEqual({
      id: 'goto_xy',
      opcode: 'motion_gotoxy',
      fields: {},
      inputs: {
        X: { kind: 'lit', value: 100 },
        Y: { kind: 'lit', value: -50 },
      },
    })

    expect(script.body[2]).toEqual({
      id: 'point_mouse',
      opcode: 'motion_pointtowards',
      fields: { TOWARDS: '_mouse_' },
      inputs: {},
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Looks
  // ---------------------------------------------------------------------------
  it('compiles Looks blocks, text shadows, and graphic effect fields', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [
          {
            type: 'event_whenthisspriteclicked',
            id: 'click_hat',
            next: {
              block: {
                type: 'looks_sayforsecs',
                id: 'say_sec',
                inputs: {
                  MESSAGE: { shadow: { type: 'text', fields: { TEXT: 'Hello Code Lab!' } } },
                  SECS: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
                },
                next: {
                  block: {
                    type: 'looks_changeeffectby',
                    id: 'ghost_effect',
                    fields: { EFFECT: 'ghost' },
                    inputs: {
                      CHANGE: { shadow: { type: 'math_number', fields: { NUM: 25 } } },
                    },
                    next: {
                      block: {
                        type: 'looks_hide',
                        id: 'hide_1',
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)
    expect(program.scripts).toHaveLength(1)

    const script = program.scripts[0]
    expect(script.hat.opcode).toBe('event_whenthisspriteclicked')
    expect(script.body).toHaveLength(3)

    expect(script.body[0]).toEqual({
      id: 'say_sec',
      opcode: 'looks_sayforsecs',
      fields: {},
      inputs: {
        MESSAGE: { kind: 'lit', value: 'Hello Code Lab!' },
        SECS: { kind: 'lit', value: 2 },
      },
    })

    expect(script.body[1]).toEqual({
      id: 'ghost_effect',
      opcode: 'looks_changeeffectby',
      fields: { EFFECT: 'ghost' },
      inputs: {
        CHANGE: { kind: 'lit', value: 25 },
      },
    })

    expect(script.body[2]).toEqual({
      id: 'hide_1',
      opcode: 'looks_hide',
      fields: {},
      inputs: {},
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Sound
  // ---------------------------------------------------------------------------
  it('compiles Sound blocks and fields', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [
          {
            type: 'event_whenstageclicked',
            id: 'stage_hat',
            next: {
              block: {
                type: 'sound_playuntildone',
                id: 'sound_1',
                fields: { SOUND_MENU: 'pop' },
                next: {
                  block: {
                    type: 'sound_setvolumeto',
                    id: 'vol_1',
                    inputs: {
                      VOLUME: { shadow: { type: 'math_number', fields: { NUM: 80 } } },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)
    expect(program.scripts).toHaveLength(1)

    const script = program.scripts[0]
    expect(script.hat.opcode).toBe('event_whenstageclicked')
    expect(script.body).toHaveLength(2)
    expect(script.body[0]).toEqual({
      id: 'sound_1',
      opcode: 'sound_playuntildone',
      fields: { SOUND_MENU: 'pop' },
      inputs: {},
    })
    expect(script.body[1]).toEqual({
      id: 'vol_1',
      opcode: 'sound_setvolumeto',
      fields: {},
      inputs: {
        VOLUME: { kind: 'lit', value: 80 },
      },
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Events & Broadcasts
  // ---------------------------------------------------------------------------
  it('compiles event hats with inputs & fields, and broadcast blocks', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [
          {
            type: 'event_whenbroadcastreceived',
            id: 'rcv_hat',
            fields: { BROADCAST_OPTION: 'start_level' },
            next: {
              block: {
                type: 'event_broadcast',
                id: 'bc_1',
                inputs: {
                  BROADCAST_INPUT: { shadow: { type: 'text', fields: { TEXT: 'fade_in' } } },
                },
              },
            },
          },
          {
            type: 'event_whengreaterthan',
            id: 'timer_hat',
            fields: { WHENGREATERTHANMENU: 'TIMER' },
            inputs: {
              VALUE: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)
    expect(program.scripts).toHaveLength(2)

    expect(program.scripts[0].hat).toEqual({
      opcode: 'event_whenbroadcastreceived',
      fields: { BROADCAST_OPTION: 'start_level' },
      inputs: {},
    })
    expect(program.scripts[0].body[0]).toEqual({
      id: 'bc_1',
      opcode: 'event_broadcast',
      fields: {},
      inputs: {
        BROADCAST_INPUT: { kind: 'lit', value: 'fade_in' },
      },
    })

    expect(program.scripts[1].hat).toEqual({
      opcode: 'event_whengreaterthan',
      fields: { WHENGREATERTHANMENU: 'TIMER' },
      inputs: {
        VALUE: { kind: 'lit', value: 10 },
      },
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Control & C-Blocks
  // ---------------------------------------------------------------------------
  it('compiles C-blocks (repeat, if, if_else, forever) into branches', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [
          {
            type: 'event_whenflagclicked',
            id: 'flag_hat',
            next: {
              block: {
                type: 'control_repeat',
                id: 'repeat_block',
                inputs: {
                  TIMES: { shadow: { type: 'math_number', fields: { NUM: 5 } } },
                  SUBSTACK: {
                    block: {
                      type: 'motion_changexby',
                      id: 'step_sub',
                      inputs: {
                        DX: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
                      },
                    },
                  },
                },
                next: {
                  block: {
                    type: 'control_if_else',
                    id: 'if_else_block',
                    inputs: {
                      CONDITION: {
                        block: {
                          type: 'sensing_keypressed',
                          id: 'key_press',
                          fields: { KEY_OPTION: 'space' },
                        },
                      },
                      SUBSTACK: {
                        block: {
                          type: 'looks_show',
                          id: 'show_sub',
                        },
                      },
                      SUBSTACK2: {
                        block: {
                          type: 'looks_hide',
                          id: 'hide_sub',
                        },
                      },
                    },
                    next: {
                      block: {
                        type: 'control_forever',
                        id: 'forever_block',
                        inputs: {
                          SUBSTACK: {
                            block: {
                              type: 'motion_turnright',
                              id: 'turn_sub',
                              inputs: {
                                DEGREES: { shadow: { type: 'math_number', fields: { NUM: 15 } } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)
    expect(program.scripts).toHaveLength(1)

    const [repeatStmt, ifElseStmt, foreverStmt] = program.scripts[0].body

    // 1. Repeat
    expect(repeatStmt.opcode).toBe('control_repeat')
    expect(repeatStmt.inputs.TIMES).toEqual({ kind: 'lit', value: 5 })
    expect(repeatStmt.branches).toHaveLength(1)
    expect(repeatStmt.branches![0]).toEqual([
      {
        id: 'step_sub',
        opcode: 'motion_changexby',
        fields: {},
        inputs: { DX: { kind: 'lit', value: 10 } },
      },
    ])

    // 2. If Else
    expect(ifElseStmt.opcode).toBe('control_if_else')
    expect(ifElseStmt.inputs.CONDITION).toEqual({
      id: 'key_press',
      kind: 'block',
      opcode: 'sensing_keypressed',
      fields: { KEY_OPTION: 'space' },
      inputs: {},
    })
    expect(ifElseStmt.branches).toHaveLength(2)
    expect(ifElseStmt.branches![0]).toEqual([
      { id: 'show_sub', opcode: 'looks_show', fields: {}, inputs: {} },
    ])
    expect(ifElseStmt.branches![1]).toEqual([
      { id: 'hide_sub', opcode: 'looks_hide', fields: {}, inputs: {} },
    ])

    // 3. Forever
    expect(foreverStmt.opcode).toBe('control_forever')
    expect(foreverStmt.branches).toHaveLength(1)
    expect(foreverStmt.branches![0]).toEqual([
      {
        id: 'turn_sub',
        opcode: 'motion_turnright',
        fields: {},
        inputs: { DEGREES: { kind: 'lit', value: 15 } },
      },
    ])
  })

  // ---------------------------------------------------------------------------
  // 6. Sensing
  // ---------------------------------------------------------------------------
  it('compiles sensing reporters and ask/answer sequence', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [
          {
            type: 'event_whenflagclicked',
            id: 'flag_hat',
            next: {
              block: {
                type: 'sensing_askandwait',
                id: 'ask_1',
                inputs: {
                  QUESTION: { shadow: { type: 'text', fields: { TEXT: 'What is your name?' } } },
                },
                next: {
                  block: {
                    type: 'looks_say',
                    id: 'say_ans',
                    inputs: {
                      MESSAGE: {
                        block: {
                          type: 'sensing_answer',
                          id: 'ans_rep',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)

    const stmts = program.scripts[0].body
    expect(stmts[0].opcode).toBe('sensing_askandwait')
    expect(stmts[1].opcode).toBe('looks_say')
    expect(stmts[1].inputs.MESSAGE).toEqual({
      id: 'ans_rep',
      kind: 'block',
      opcode: 'sensing_answer',
      fields: {},
      inputs: {},
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Operators & Nested Expressions
  // ---------------------------------------------------------------------------
  it('compiles nested arithmetic and logical operators', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [
          {
            type: 'event_whenflagclicked',
            id: 'flag_hat',
            next: {
              block: {
                type: 'looks_say',
                id: 'say_calc',
                inputs: {
                  MESSAGE: {
                    block: {
                      type: 'operator_add',
                      id: 'add_1',
                      inputs: {
                        NUM1: {
                          block: {
                            type: 'operator_multiply',
                            id: 'mul_1',
                            inputs: {
                              NUM1: { shadow: { type: 'math_number', fields: { NUM: 6 } } },
                              NUM2: { shadow: { type: 'math_number', fields: { NUM: 7 } } },
                            },
                          },
                        },
                        NUM2: {
                          shadow: { type: 'math_number', fields: { NUM: 10 } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)

    const sayStmt = program.scripts[0].body[0]
    expect(sayStmt.inputs.MESSAGE).toEqual({
      id: 'add_1',
      kind: 'block',
      opcode: 'operator_add',
      fields: {},
      inputs: {
        NUM1: {
          id: 'mul_1',
          kind: 'block',
          opcode: 'operator_multiply',
          fields: {},
          inputs: {
            NUM1: { kind: 'lit', value: 6 },
            NUM2: { kind: 'lit', value: 7 },
          },
        },
        NUM2: { kind: 'lit', value: 10 },
      },
    })
  })

  // ---------------------------------------------------------------------------
  // 8. Variables & Lists (Data)
  // ---------------------------------------------------------------------------
  it('extracts variable and list declarations and compiles variable statements', () => {
    const ws: WorkspaceJson = {
      variables: [
        { id: 'v_score', name: 'Score' },
        { id: 'l_items', name: 'Inventory', type: 'list' },
      ],
      blocks: {
        blocks: [
          {
            type: 'event_whenflagclicked',
            id: 'flag_hat',
            next: {
              block: {
                type: 'data_setvariableto',
                id: 'set_score',
                fields: { VARIABLE: { id: 'v_score', name: 'Score' } },
                inputs: {
                  VALUE: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
                },
                next: {
                  block: {
                    type: 'data_addtolist',
                    id: 'add_item',
                    fields: { LIST: 'l_items' },
                    inputs: {
                      ITEM: { shadow: { type: 'text', fields: { TEXT: 'magic_gem' } } },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)

    expect(program.variables).toEqual([{ id: 'v_score', name: 'Score', value: 0 }])
    expect(program.lists).toEqual([{ id: 'l_items', name: 'Inventory', value: [] }])

    const [setVar, addList] = program.scripts[0].body
    expect(setVar).toEqual({
      id: 'set_score',
      opcode: 'data_setvariableto',
      fields: { VARIABLE: 'v_score' },
      inputs: { VALUE: { kind: 'lit', value: 100 } },
    })

    expect(addList).toEqual({
      id: 'add_item',
      opcode: 'data_addtolist',
      fields: { LIST: 'l_items' },
      inputs: { ITEM: { kind: 'lit', value: 'magic_gem' } },
    })
  })

  // ---------------------------------------------------------------------------
  // 9. Custom Procedures (Scratch-style definition and call)
  // ---------------------------------------------------------------------------
  it('compiles Scratch-style procedures_definition with argument reporters and calls', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [
          // Procedure definition
          {
            type: 'procedures_definition',
            id: 'def_jump',
            inputs: {
              custom_block: {
                block: {
                  type: 'procedures_prototype',
                  id: 'proto_jump',
                  extraState: {
                    proccode: 'jump %s times %b',
                    argumentNames: ['steps', 'fast'],
                    warp: true,
                  },
                },
              },
            },
            next: {
              block: {
                type: 'motion_movesteps',
                id: 'proc_move',
                inputs: {
                  STEPS: {
                    block: {
                      type: 'argument_reporter_string_number',
                      id: 'arg_steps',
                      fields: { VALUE: 'steps' },
                    },
                  },
                },
                next: {
                  block: {
                    type: 'control_if',
                    id: 'proc_if',
                    inputs: {
                      CONDITION: {
                        block: {
                          type: 'argument_reporter_boolean',
                          id: 'arg_fast',
                          fields: { VALUE: 'fast' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },

          // Procedure caller
          {
            type: 'event_whenflagclicked',
            id: 'caller_hat',
            next: {
              block: {
                type: 'procedures_call',
                id: 'call_jump',
                extraState: {
                  proccode: 'jump %s times %b',
                  argumentNames: ['steps', 'fast'],
                },
                inputs: {
                  steps: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
                  fast: { shadow: { type: 'text', fields: { TEXT: 'true' } } },
                },
              },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)

    // Check compiled Procedure
    expect(program.procedures).toHaveLength(1)
    const proc = program.procedures[0]
    expect(proc.proccode).toBe('jump %s times %b')
    expect(proc.argumentNames).toEqual(['steps', 'fast'])
    expect(proc.warp).toBe(true)
    expect(proc.body).toHaveLength(2)

    // Parameter reporters inside procedure body
    expect(proc.body[0].inputs.STEPS).toEqual({
      kind: 'param',
      name: 'steps',
      boolean: false,
    })
    expect(proc.body[1].inputs.CONDITION).toEqual({
      kind: 'param',
      name: 'fast',
      boolean: true,
    })

    // Check caller statement
    expect(program.scripts).toHaveLength(1)
    const callStmt = program.scripts[0].body[0]
    expect(callStmt.opcode).toBe('procedures_call')
    expect(callStmt.call).toEqual({ proccode: 'jump %s times %b' })
    expect(callStmt.inputs.steps).toEqual({ kind: 'lit', value: 50 })
  })

  // ---------------------------------------------------------------------------
  // 10. Shareable Procedures plugin serialization
  // ---------------------------------------------------------------------------
  it('compiles Shareable Procedures serialization into Procedure IR', () => {
    const ws: WorkspaceJson = {
      procedures: [
        {
          id: 'proc_alpha',
          name: 'computeBonus',
          parameters: [{ id: 'p1', name: 'multiplier' }],
        },
      ],
      blocks: {
        blocks: [
          {
            type: 'procedures_defnoreturn',
            id: 'def_shareable',
            extraState: {
              procedureId: 'proc_alpha',
              warp: true,
            },
            inputs: {
              STACK: {
                block: {
                  type: 'motion_changexby',
                  id: 'body_move',
                  inputs: {
                    DX: {
                      block: {
                        type: 'argument_reporter_string_number',
                        fields: { VALUE: 'multiplier' },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(diagnostics).toHaveLength(0)
    expect(program.procedures).toHaveLength(1)

    const proc = program.procedures[0]
    expect(proc.proccode).toBe('computeBonus')
    expect(proc.argumentNames).toEqual(['multiplier'])
    expect(proc.warp).toBe(true)
    expect(proc.body).toHaveLength(1)
    expect(proc.body[0].opcode).toBe('motion_changexby')
  })

  // ---------------------------------------------------------------------------
  // 11. Diagnostics and Edge Cases
  // ---------------------------------------------------------------------------
  it('reports disconnected top-level blocks as diagnostics without throwing', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [
          {
            type: 'motion_movesteps',
            id: 'orphan_move',
            inputs: {
              STEPS: { shadow: { type: 'math_number', fields: { NUM: 10 } } },
            },
          },
          {
            type: 'operator_add',
            id: 'orphan_reporter',
          },
        ],
      },
    }

    const { program, diagnostics } = compileWorkspace(ws)
    expect(program.scripts).toHaveLength(0)
    expect(diagnostics).toHaveLength(2)

    expect(diagnostics[0].code).toBe('block.disconnected')
    expect(diagnostics[0].blockId).toBe('orphan_move')
    expect(diagnostics[1].code).toBe('block.disconnected')
    expect(diagnostics[1].blockId).toBe('orphan_reporter')
  })

  it('handles corrupted or non-object workspace input gracefully', () => {
    const resString = compileWorkspace('{invalid json')
    expect(resString.diagnostics[0].code).toBe('workspace.invalid_json')
    expect(resString.program.scripts).toHaveLength(0)

    const resNull = compileWorkspace(null)
    expect(resNull.diagnostics[0].code).toBe('workspace.invalid')

    const resEmptyObj = compileWorkspace({})
    expect(resEmptyObj.program.scripts).toHaveLength(0)
    expect(resEmptyObj.diagnostics).toHaveLength(0)
  })

  it('handles top blocks with missing type without throwing', () => {
    const ws: WorkspaceJson = {
      blocks: {
        blocks: [{ id: 'no_type_block' }],
      },
    }

    const { diagnostics } = compileWorkspace(ws)
    expect(diagnostics[0].code).toBe('block.no_type')
  })
})
