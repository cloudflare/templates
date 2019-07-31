// set up global namespace for worker environment
import * as makeServiceWorkerEnv from 'service-worker-mock'
declare var global: any
Object.assign(global, makeServiceWorkerEnv())
