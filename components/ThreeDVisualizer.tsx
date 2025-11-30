import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XIcon } from './icons';

interface ThreeDVisualizerProps {
  modelName: string;
  onClose: () => void;
}

const createDNA = () => {
    const group = new THREE.Group();
    const radius = 2;
    const tube = 0.4;
    const radialSegments = 8;
    const tubularSegments = 100;
    const p = 2; // turns
    
    class CustomSinCurve extends THREE.Curve<THREE.Vector3> {
        scale: number;
        offset: number;
        constructor(scale = 1, offset = 0) {
            super();
            this.scale = scale;
            this.offset = offset;
        }

        getPoint(t: number) {
            const tx = Math.cos(2 * Math.PI * t * p + this.offset) * radius;
            const ty = t * 20 - 10;
            const tz = Math.sin(2 * Math.PI * t * p + this.offset) * radius;
            return new THREE.Vector3(tx, ty, tz);
        }
    }

    const path1 = new CustomSinCurve(10, 0);
    const path2 = new CustomSinCurve(10, Math.PI);

    const geometry1 = new THREE.TubeGeometry(path1, tubularSegments, tube, radialSegments, false);
    const material1 = new THREE.MeshLambertMaterial({ color: 0x0077ff });
    const mesh1 = new THREE.Mesh(geometry1, material1);
    group.add(mesh1);

    const geometry2 = new THREE.TubeGeometry(path2, tubularSegments, tube, radialSegments, false);
    const material2 = new THREE.MeshLambertMaterial({ color: 0xff4400 });
    const mesh2 = new THREE.Mesh(geometry2, material2);
    group.add(mesh2);

    const rungs = 20;
    for (let i = 0; i <= rungs; i++) {
        const t = i / rungs;
        const p1 = path1.getPoint(t);
        const p2 = path2.getPoint(t);
        const path = new THREE.LineCurve3(p1, p2);
        const rungGeom = new THREE.TubeGeometry(path, 1, 0.15, 6, false);
        const rungMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
        const rung = new THREE.Mesh(rungGeom, rungMat);
        group.add(rung);
    }
    
    group.scale.set(0.5, 0.5, 0.5);

    return group;
};


const createAtom = () => {
    const group = new THREE.Group();
    // Nucleus
    const nucleusGeom = new THREE.SphereGeometry(1, 32, 16);
    const nucleusMat = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const nucleus = new THREE.Mesh(nucleusGeom, nucleusMat);
    group.add(nucleus);

    // Orbits
    const orbitGeom = new THREE.TorusGeometry(3, 0.05, 16, 100);
    const orbitMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
    
    const orbit1 = new THREE.Mesh(orbitGeom, orbitMat);
    orbit1.rotation.x = Math.PI / 2;
    group.add(orbit1);

    const orbit2 = new THREE.Mesh(orbitGeom, orbitMat);
    orbit2.rotation.y = Math.PI / 3;
    group.add(orbit2);
    
    const orbit3 = new THREE.Mesh(orbitGeom, orbitMat);
    orbit3.rotation.y = -Math.PI / 3;
    group.add(orbit3);

    // Electrons
    const electronGeom = new THREE.SphereGeometry(0.3, 16, 8);
    const electronMat = new THREE.MeshLambertMaterial({ color: 0x0000ff });
    
    const e1 = new THREE.Object3D();
    orbit1.add(e1);
    const electron1 = new THREE.Mesh(electronGeom, electronMat);
    electron1.position.x = 3;
    e1.add(electron1);

    const e2 = new THREE.Object3D();
    orbit2.add(e2);
    const electron2 = new THREE.Mesh(electronGeom, electronMat);
    electron2.position.x = 3;
    e2.add(electron2);

    const e3 = new THREE.Object3D();
    orbit3.add(e3);
    const electron3 = new THREE.Mesh(electronGeom, electronMat);
    electron3.position.x = 3;
    e3.add(electron3);

    group.userData.update = (time: number) => {
        e1.rotation.z = time * 1.2;
        e2.rotation.z = time * 1.5;
        e3.rotation.z = time * 0.9;
    };

    return group;
};

const createMolecule = () => {
    const group = new THREE.Group();

    // H2O molecule
    const oxygenRadius = 1.0;
    const hydrogenRadius = 0.6;
    const bondLength = 2.5;
    const bondAngle = THREE.MathUtils.degToRad(104.5);

    // Oxygen atom
    const oxygenMat = new THREE.MeshLambertMaterial({ color: 0xff4444 });
    const oxygenGeom = new THREE.SphereGeometry(oxygenRadius, 32, 16);
    const oxygen = new THREE.Mesh(oxygenGeom, oxygenMat);
    group.add(oxygen);

    // Hydrogen atoms
    const hydrogenMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const hydrogenGeom = new THREE.SphereGeometry(hydrogenRadius, 32, 16);
    
    const h1 = new THREE.Mesh(hydrogenGeom, hydrogenMat);
    h1.position.set(
        bondLength * Math.cos(bondAngle / 2),
        bondLength * Math.sin(bondAngle / 2),
        0
    );
    group.add(h1);

    const h2 = new THREE.Mesh(hydrogenGeom, hydrogenMat);
    h2.position.set(
        bondLength * Math.cos(-bondAngle / 2),
        bondLength * Math.sin(-bondAngle / 2),
        0
    );
    group.add(h2);

    // Bonds
    const createBond = (v1: THREE.Vector3, v2: THREE.Vector3) => {
        const bondMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
        const distance = v1.distanceTo(v2);
        const bondGeom = new THREE.CylinderGeometry(0.2, 0.2, distance, 8);
        const bond = new THREE.Mesh(bondGeom, bondMat);
        bond.position.lerpVectors(v1, v2, 0.5);
        bond.lookAt(v2);
        bond.rotateX(Math.PI / 2);
        return bond;
    };

    group.add(createBond(oxygen.position, h1.position));
    group.add(createBond(oxygen.position, h2.position));
    
    group.scale.set(1.5, 1.5, 1.5);

    return group;
};

const createPlanet = () => {
    const group = new THREE.Group();

    // Planet body
    const planetGeom = new THREE.SphereGeometry(3, 32, 16);
    const planetMat = new THREE.MeshPhongMaterial({ color: 0xddaa77, shininess: 20 });
    const planet = new THREE.Mesh(planetGeom, planetMat);
    group.add(planet);

    // Rings
    const ringGeom = new THREE.RingGeometry(4, 5.5, 64);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0xaaaa99, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = Math.PI / 2.5;
    group.add(ring);

    // Moon
    const moonGeom = new THREE.SphereGeometry(0.5, 16, 8);
    const moonMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const moon = new THREE.Mesh(moonGeom, moonMat);
    moon.position.x = 8;
    
    const moonPivot = new THREE.Object3D();
    moonPivot.add(moon);
    group.add(moonPivot);

    group.userData.update = (time: number) => {
        moonPivot.rotation.y = time * 0.5;
        moonPivot.rotation.z = time * 0.1;
    };
    
    return group;
};

const createModel = (modelName: string): THREE.Object3D | null => {
    switch (modelName.toLowerCase()) {
        case 'atom':
            return createAtom();
        case 'dna':
            return createDNA();
        case 'molecule':
            return createMolecule();
        case 'planet':
            return createPlanet();
        default:
            const geometry = new THREE.BoxGeometry(4, 4, 4);
            const material = new THREE.MeshNormalMaterial();
            return new THREE.Mesh(geometry, material);
    }
};

export const ThreeDVisualizer: React.FC<ThreeDVisualizerProps> = ({ modelName, onClose }) => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;
        const currentMount = mountRef.current;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111111);

        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        camera.position.z = 15;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        currentMount.appendChild(renderer.domElement);
        
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        const model = createModel(modelName);
        if (model) {
            scene.add(model);
        }

        const clock = new THREE.Clock();
        
        let animationFrameId: number;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const elapsedTime = clock.getElapsedTime();
            
            if (model && model.userData.update) {
                model.userData.update(elapsedTime);
            } else if (model) {
                model.rotation.x += 0.001;
                model.rotation.y += 0.002;
            }

            controls.update();
            renderer.render(scene, camera);
        };
        animate();
        
        const handleResize = () => {
            if (!currentMount) return;
            camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
            if (renderer.domElement.parentNode === currentMount) {
                 currentMount.removeChild(renderer.domElement);
            }
            scene.traverse(object => {
                if (object instanceof THREE.Mesh) {
                    object.geometry?.dispose();
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material?.dispose();
                    }
                }
            });
            renderer.dispose();
        };
    }, [modelName]);

    return (
        <div className="w-full h-full relative">
            <div ref={mountRef} className="w-full h-full" />
            <button 
                onClick={onClose} 
                className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-black/80 transition-colors z-10"
                aria-label="Close 3D Visualizer"
            >
                <XIcon className="w-6 h-6" />
            </button>
        </div>
    );
};