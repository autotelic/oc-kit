// Re-export tools with kit_ prefix for opencode compatibility
export { 
  run as kit,
  list as kit_list,
  docker as kit_docker, 
  compose as kit_compose,
  dockerList as kit_dockerList,
  devStart as kit_devStart,
  devStatus as kit_devStatus,
  devStop as kit_devStop,
  devRestart as kit_devRestart,
  devStartAll as kit_devStartAll,
  devQuery as kit_devQuery,
  astGrepSearch as kit_astGrepSearch,
  astGrepScan as kit_astGrepScan,
  astGrepDump as kit_astGrepDump
} from '../src/kit.js'