import { defineScenarios } from "@marinho-gestao/scenarios";
import { createServerHarness } from "./testing/harness";

defineScenarios(createServerHarness());
