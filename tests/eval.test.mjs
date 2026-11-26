import assert from "node:assert/strict";
import {test} from "node:test";
import {comparisonVersions,exampleTraces,metrics,normalize,pairCases} from "../app/data.ts";

test("unknown labels and measurements do not become failures, correct tools or zeroes", () => {
  const unknown = {...exampleTraces[0], expectedTool:null, expectedSkill:null, predictedTool:null,
    predictedSkill:null, tokens:null, latency:null, success:null};
  assert.deepEqual(metrics([unknown]),{precision:null,recall:null,tool:null,success:null,tokens:null,latency:null});
  assert.deepEqual(metrics([unknown,exampleTraces[0]]),metrics([exampleTraces[0]]));
  assert.deepEqual(normalize(exampleTraces[0],0),exampleTraces[0]);
});

test("duplicate case trials cannot silently change paired metrics", () => {
  const [base,candidate] = exampleTraces;
  const result = pairCases([base,candidate,{...candidate,id:"another-run"}],base.version,candidate.version);
  assert.deepEqual(result.pairs,[]);
  assert.deepEqual(result.ambiguous,[base.caseId]);
  assert.equal(pairCases(exampleTraces,base.version,candidate.version).pairs.length,6);
});

test("comparison follows imported dataset versions and preserves explicit selections", () => {
  assert.deepEqual(comparisonVersions([], "", ""), ["", ""]);
  assert.deepEqual(comparisonVersions(["v1"], "", ""), ["v1", ""]);
  assert.deepEqual(comparisonVersions(["v1","v2"], "", ""), ["v1","v2"]);
  assert.deepEqual(comparisonVersions(["v1","v2","v3"], "v3", "v1"), ["v3","v1"]);
  assert.deepEqual(comparisonVersions(["v2","v3"], "removed", "v2"), ["v3","v2"]);
  assert.deepEqual(pairCases(exampleTraces, "v1 基线", "v1 基线").pairs, []);
});
