import electron from './vendor/electron';
import { Service } from './services/service';
import { AutoConfigService } from './services/auto-config';
import { ConfigPersistenceService } from './services/config-persistence';
import { YoutubeService } from './services/platforms/youtube';
import { TwitchService } from './services/platforms/twitch';
import { ScenesService, SceneItem, Scene } from './services/scenes';
import { ClipboardService } from  './services/clipboard';
import { AudioService, AudioSource } from  './services/audio';
import { CustomizationService } from  './services/customization';
import { HostsService } from  './services/hosts';
import { HotkeysService } from  './services/hotkeys';
import { KeyListenerService } from  './services/key-listener';
import { NavigationService } from  './services/navigation';
import { ObsApiService } from  './services/obs-api';
import { OnboardingService } from  './services/onboarding';
import { PerformanceService } from  './services/performance';
import { PersistentStatefulService } from  './services/persistent-stateful-service';
import { SettingsService } from  './services/settings';
import { SourcesService, Source } from  './services/sources';
import { UserService } from  './services/user';
import { VideoService } from  './services/video';
import { WidgetsService } from  './services/widgets';
import { WindowService } from  './services/window';
import { StatefulService } from './services/stateful-service';
import { ScenesTransitionsService } from  './services/scenes-transitions';
import SourceFiltersService from  './services/source-filters';
import StreamingService from  './services/streaming';
import Utils from './services/utils';
import { commitMutation } from './store';
import traverse from 'traverse';

const { ipcRenderer } = electron;

interface IRequestToService {
  id: string;
  payload: { action: 'initService' | 'callServiceMethod' } & Dictionary<any>;
}


interface IServiceResponce {
  id: string;
  mutations: IMutation[];
  payload: any;
}


export interface IMutation {
  type: string;
  payload: any;
}


export class ServicesManager extends Service {

  /**
   * list of used application services
   */
  private services: Dictionary<any> = {
    AutoConfigService,
    YoutubeService,
    TwitchService,
    ScenesService, SceneItem, Scene,
    ClipboardService,
    AudioService, AudioSource,
    CustomizationService,
    HostsService,
    HotkeysService,
    KeyListenerService,
    NavigationService,
    ObsApiService,
    OnboardingService,
    PerformanceService,
    PersistentStatefulService,
    ScenesTransitionsService,
    SettingsService,
    SourceFiltersService,
    SourcesService, Source,
    StreamingService,
    UserService,
    VideoService,
    WidgetsService,
    WindowService
  };

  private instances: Dictionary<Service> = {};
  private mutationsBufferingEnabled = false;
  private bufferedMutations: IMutation[] = [];

  init() {

    if (Utils.isChildWindow()) {
      Service.setupProxy(service => this.applyIpcProxy(service));
      Service.setupInitFunction(service => {
        const serviceName = service.constructor.name;
        if (!this.services[serviceName]) return false;

        electron.ipcRenderer.sendSync('services-request', {
          action: 'initService',
          serviceName: service.constructor.name
        });

        return true;
      });
    }

  }


  getService(serviceName: string) {
    return this.services[serviceName];
  }


  getStatefulServices(): Dictionary<typeof StatefulService> {
    let statefulServices = {};
    Object.keys(this.services).forEach(serviceName => {
      if (!this.services[serviceName]['initialState']) return;
      statefulServices[serviceName] = this.services[serviceName];
    });
    // TODO: rid of stateless services like Scene, Source, etc.. here
    statefulServices = { ...statefulServices, Scene, Source, SceneItem, AudioSource };
    return statefulServices;
  }


  /**
   * start listen calls to services from child window
   */
  listenApiCalls() {
    ipcRenderer.on('services-request', (event, request: IRequestToService) => {
      const action = request.payload.action;
      let response: IServiceResponce;
      this.startBufferingMutations();

      if (action === 'initService') {

        this.initService(request.payload.serviceName);
        response = {
          id: request.id,
          mutations: this.stopBufferingMutations(),
          payload: null
        };

      } else if (action === 'callServiceMethod') {
        const {
          serviceName,
          methodName,
          args,
          isMutator,
          constructorArgs
        } = request.payload;

        let responsePayload: any;

        if (isMutator) {
          const mutator = this.getMutator(serviceName, constructorArgs);
          responsePayload = mutator[methodName].apply(mutator, args);
        } else {
          const service = this.getInstance(serviceName);
          responsePayload = service[methodName].apply(service, args);
        }

        if (responsePayload && responsePayload.isMutator) {
          response = {
            id: request.id,
            mutations: this.stopBufferingMutations(),
            payload: {
              isMutator: true,
              mutatorName: responsePayload.mutatorName,
              constructorArgs: responsePayload.constructorArgs
            }
          };
        } else {
          response = {
            id: request.id,
            mutations: this.stopBufferingMutations(),
            payload: responsePayload
          };
        }
      }

      ipcRenderer.send('services-response', response);
    });
    ipcRenderer.send('services-ready');
  }


  isMutationBufferingEnabled() {
    return this.mutationsBufferingEnabled;
  }


  addMutationToBuffer(mutation: IMutation) {
    this.bufferedMutations.push(mutation);
  }


  /**
   * start buffering mutations to send them
   * as result of a service's method call
   */
  private startBufferingMutations() {
    this.mutationsBufferingEnabled = true;
  }


  /**
   * stop buffering and clear buffer
   */
  private stopBufferingMutations(): IMutation[] {
    this.mutationsBufferingEnabled = false;
    const mutations = this.bufferedMutations;
    this.bufferedMutations = [];
    return mutations;
  }


  /**
   * uses for child window services
   * all services methods calls will be sent to the main window
   */
  private applyIpcProxy(service: Service): Service {

    const availableServices = Object.keys(this.services);
    if (!availableServices.includes(service.constructor.name)) return service;

    // TODO: add all services to whitelist
    const whiteList = [
      'SourcesService',
      'ScenesService',
      'AudioService',
      'Scene',
      'SceneItem',
      'Source',
      'AudioSource'
    ];

    if (!whiteList.includes(service.constructor.name)) return service;

    return new Proxy(service, {
      get: (target, property, receiver) => {

        if (!target[property]) return target[property];

        if (target[property].isMutator) {
          return this.applyIpcProxy(target[property]);
        }

        if (typeof target[property] !== 'function') return target[property];

        const serviceName = target.constructor.name;
        const methodName = property;
        const isMutator = target['isMutator'];
        const constructorArgs = isMutator ? target['constructorArgs'] : [];

        return (...args: any[]) => {

          const response: IServiceResponce = electron.ipcRenderer.sendSync('services-request', {
            action: 'callServiceMethod',
            serviceName,
            methodName,
            args,
            isMutator,
            constructorArgs
          });

          const payload = response.payload;
          response.mutations.forEach(mutation => commitMutation(mutation));

          if (payload && payload.isMutator) {
            const mutator = this.getMutator(payload.mutatorName, payload.constructorArgs);
            return this.applyIpcProxy(mutator);
          } else {
            // payload can contain mutators-objects
            // we have to wrap them in IpcProxy too
            traverse(payload).forEach((item: any) => {
              if (item && item.isMutator) {
                const mutator = this.getMutator(item.mutatorName, item.constructorArgs);
                return this.applyIpcProxy(mutator);
              }
            });
            return payload;
          }



        };
      }
    });
  }


  private getMutator(name: string, constructorArgs: any[]) {
    const Mutator = this.services[name];
    return new (Mutator as any)(...constructorArgs);
  }


  private initService(serviceName: string) {
    const ServiceClass = this.services[serviceName];
    if (!ServiceClass) throw `unknown service: ${serviceName}`;
    if (this.instances[serviceName]) return;
    this.instances[serviceName] = ServiceClass.instance;
  }


  private getInstance(serviceName: string): Service {
    return this.instances[serviceName];
  }

}
