import assert from "node:assert/strict";
import {test} from "node:test";
import {exampleTraces,metrics,normalize,pairCases} from "../app/data.ts";

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
