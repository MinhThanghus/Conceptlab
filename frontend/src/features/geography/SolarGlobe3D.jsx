import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createStage } from '../../lib/three/stage.js'
import { scenePalette } from '../../lib/three/kit.js'
import '../../styles/stage3d.css'
import { geographicDirection, solarDeclination, subsolarLongitude } from './solarMath.js'

const r = Math.PI / 180
const point = (latitude, longitude, radius = 1.2) => new THREE.Vector3(...geographicDirection(latitude, longitude)).multiplyScalar(radius)

/** Local NASA Blue Marble surface with a separate approximate solar illumination. */
export default function SolarGlobe3D({ latitude, longitude, day, hour, onError, onTextureError, onTextureReady }) {
  const host = useRef(null)
  const stageRef = useRef(null)
  const current = useRef({ latitude, longitude, day, hour })
  current.current = { latitude, longitude, day, hour }

  useEffect(() => {
    let stage
    const contextLost = () => onError?.()
    const owned = []
    let alive = true
    try {
      stage = createStage(host.current, { target: { x: 0, y: 0, z: 0 }, height: 3.8, width: 4, turn: true, view: { azimuth: 0.9, elevation: 0.28 }, catcher: 0, contact: false })
      stage.canvas.addEventListener('webglcontextlost', contextLost)
      const palette = scenePalette(host.current)
      const shader = new THREE.ShaderMaterial({
        uniforms: { sun: { value: new THREE.Vector3(1, 0, 0) }, earthMap: { value: null }, hasMap: { value: 0 } },
        vertexShader: 'varying vec3 normalWorld; varying vec2 surfaceUv; void main(){ normalWorld=normalize(mat3(modelMatrix)*normal); surfaceUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: `uniform vec3 sun; uniform sampler2D earthMap; uniform float hasMap;
          varying vec3 normalWorld; varying vec2 surfaceUv;
          void main(){
            float light=max(dot(normalize(normalWorld),normalize(sun)),0.0);
            float lit=smoothstep(-0.025,0.075,dot(normalize(normalWorld),normalize(sun)));
            vec3 surface=mix(vec3(0.12,0.39,0.48),texture2D(earthMap,surfaceUv).rgb,hasMap);
            vec3 night=surface*0.09+vec3(0.005,0.012,0.028);
            vec3 day=surface*(0.72+0.30*light);
            gl_FragColor=vec4(mix(night,day,lit),1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      })
      const texture = new THREE.TextureLoader().load('/geography/earth-blue-marble-200407.jpg', () => {
        if (!alive) return
        shader.uniforms.hasMap.value = 1
        onTextureReady?.()
        stage.invalidate()
      }, undefined, () => { if (alive) onTextureError?.() })
      texture.colorSpace = THREE.SRGBColorSpace
      shader.uniforms.earthMap.value = texture
      owned.push(texture)
      const sphereGeometry = new THREE.SphereGeometry(1.2, 96, 64)
      const globe = new THREE.Mesh(sphereGeometry, shader)
      owned.push(sphereGeometry, shader)
      stage.world.add(globe)
      const lines = new THREE.LineBasicMaterial({ color: palette.sugar, transparent: true, opacity: 0.24 })
      owned.push(lines)
      for (const lat of [-60, -30, 0, 30, 60]) {
        const geometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 73 }, (_, i) => point(lat, i * 5, 1.205)))
        owned.push(geometry)
        stage.world.add(new THREE.Line(geometry, lines))
      }
      for (const lon of [0, 45, 90, 135]) {
        const points = Array.from({ length: 73 }, (_, i) => {
          const angle = 2 * Math.PI * i / 72
          return new THREE.Vector3(1.205 * Math.cos(angle) * Math.cos(lon * r), 1.205 * Math.sin(angle), -1.205 * Math.cos(angle) * Math.sin(lon * r))
        })
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        owned.push(geometry)
        stage.world.add(new THREE.Line(geometry, lines))
      }
      const markerGeometry = new THREE.SphereGeometry(0.045, 20, 16)
      const markerMaterial = new THREE.MeshBasicMaterial({ color: palette.pear })
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.userData.noFit = true
      owned.push(markerGeometry, markerMaterial)
      stage.world.add(marker)
      const ringGeometry = new THREE.RingGeometry(.070, .088, 40)
      const ringMaterial = new THREE.MeshBasicMaterial({ color: palette.card, side: THREE.DoubleSide, depthTest: false })
      const markerRing = new THREE.Mesh(ringGeometry, ringMaterial)
      markerRing.userData.noFit = true
      owned.push(ringGeometry, ringMaterial)
      stage.world.add(markerRing)
      const atmosphereGeometry = new THREE.SphereGeometry(1.225, 64, 48)
      const atmosphereMaterial = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec3 n; varying vec3 p; void main(){vec4 w=modelMatrix*vec4(position,1.0);p=w.xyz;n=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}',
        fragmentShader: 'varying vec3 n; varying vec3 p; void main(){float rim=pow(1.0-max(dot(normalize(n),normalize(cameraPosition-p)),0.0),3.0);gl_FragColor=vec4(0.20,0.55,0.78,rim*0.30);}',
      })
      const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
      owned.push(atmosphereGeometry, atmosphereMaterial)
      stage.world.add(atmosphere)
      const axisGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.45, 0), new THREE.Vector3(0, 1.45, 0)])
      const axisMaterial = new THREE.LineBasicMaterial({ color: palette.coral })
      owned.push(axisGeometry, axisMaterial)
      stage.world.add(new THREE.Line(axisGeometry, axisMaterial))
      stageRef.current = { stage, shader, marker }
      const update = () => {
        const values = current.current
        const declination = solarDeclination(values.day) * r
        // Keep the actual chosen longitude facing the camera. Move the Sun rather
        // than moving the location when local solar time changes.
        const cameraLongitude = Math.atan2(stage.camera.position.z, stage.camera.position.x)
        const turn = -values.longitude * r - cameraLongitude
        stage.world.rotation.y = turn
        const subsolar = subsolarLongitude(values.longitude, values.hour)
        shader.uniforms.sun.value.copy(point(declination / r, subsolar, 1)).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn)
        marker.position.copy(point(values.latitude, values.longitude, 1.235))
        markerRing.position.copy(point(values.latitude, values.longitude, 1.245))
        markerRing.lookAt(point(values.latitude, values.longitude, 2))
        stage.invalidate()
      }
      stageRef.current.update = update
      // the globe fills the night well; the marker and the axis never change the framing
      stage.frame?.(stage.world, { fill: 0.8 })
      update()
    } catch {
      onError?.()
    }
    return () => {
      alive = false
      stageRef.current = null
      stage?.canvas.removeEventListener('webglcontextlost', contextLost)
      owned.forEach((item) => item.dispose())
      stage?.dispose()
    }
  }, [onError, onTextureError, onTextureReady])

  useEffect(() => { stageRef.current?.update() }, [latitude, longitude, day, hour])
  return <div className="geo-globe stage3d is-night" ref={host} aria-hidden="true" />
}
