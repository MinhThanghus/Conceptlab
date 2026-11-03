import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import SportsField3D from './SportsField3D.jsx'
import * as THREE from 'three'
import { disposeSports, sportsCoordinates, updateSportsFrame } from '../../../lib/three/models/sportsField.js'

vi.mock('../../../components/lab3d/support.js', () => ({ can3D: () => false }))
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('optional sports 3D', () => {
  it.each(['football', 'futsal', 'volleyball', 'basketball', 'badminton'])('preserves the 2D board fallback for %s', (sport) => {
    window.localStorage.setItem('cl.lang', 'en')
    render(<I18nProvider><SportsField3D sport={sport} frame={{ players: [] }} /></I18nProvider>)
    expect(screen.getByText(/2D board above remains available/)).toBeTruthy()
    expect(screen.getByText(/does not show its real height or trajectory/)).toBeTruthy()
  })
  it('maps normalized positions to the same court edges and center', () => {
    for (const sport of ['football', 'futsal', 'volleyball', 'basketball', 'badminton']) {
      expect(sportsCoordinates(sport, .5, .5)).toEqual({ x: 0, z: 0 })
      expect(sportsCoordinates(sport, 0, 0).x).toBe(-3)
      expect(sportsCoordinates(sport, 1, 1).x).toBe(3)
    }
  })
  it('updates the displayed frame and ghost positions without rebuilding players', () => {
    const ctx = { beginPath() {}, arc() {}, fill() {}, stroke() {}, fillText() {} }
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
    const group = new THREE.Group()
    const frame = { players: [{ id: 'p1', team: 'A', label: '1', x: .2, y: .3 }], ball: { x: .25, y: .4 }, arrows: [] }
    const ghost = { players: [{ id: 'p1', team: 'A', label: '1', x: .8, y: .7 }], ball: { x: .75, y: .6 }, arrows: [] }
    updateSportsFrame(THREE, group, 'football', frame, ghost)
    const player = group.userData.players.get('p:p1')
    expect(player.position.x).toBeCloseTo(-1.8)
    expect(group.userData.players.get('g:p1').position.x).toBeCloseTo(1.8)
    expect(group.userData.ghostBall.visible).toBe(true)
    updateSportsFrame(THREE, group, 'football', { ...frame, players: [{ ...frame.players[0], x: .6 }] }, null)
    expect(group.userData.players.get('p:p1')).toBe(player)
    expect(player.position.x).toBeCloseTo(.6)
    expect(group.userData.ghostBall.visible).toBe(false)
    disposeSports(group)
    spy.mockRestore()
  })
})
