# SAMPLES.md — 음원 라이선스 조사 (단계 0)

조사일: 2026-09-28. 원문(GitHub LICENSE/README) 확인 여부를 함께 표기한다.
원칙: 재배포 허용(CC0, CC-BY)만 채택. NC(비상업)·미확인은 공개 앱에 넣지 않는다.

## 채택 후보

| 용도 | 음원 | 라이선스 | 원문 확인 | 표기 의무 | 비고 |
|---|---|---|---|---|---|
| 어쿠스틱 드럼(킥/스네어/하이햇/심벌/탐) | [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) (Versilian) | CC0-1.0 | LICENSE 원문 확인 | 없음 | 재즈 킷. 록/팝용 킥은 어색할 수 있어 청취 후 결정 |
| 업라이트 베이스 | [Meatbass](https://github.com/sfzinstruments/karoryfer.meatbass) (Karoryfer) | CC0-1.0 | 저장소 확인 | 없음 | 원본 188MB → 필요한 음만 추려 mp3로 축소 |
| 일렉 베이스 | [Black and Blue Basses](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses) (Karoryfer) | CC0 1.0 | 저장소 확인 | 없음 | 록/팝용. 핑거/픽 여부는 청취 후 확인 |
| 스트링 | VSCO 2 Community Edition (Versilian) | CC0 (검색 결과 기준) | **원문 미확인** | 없음 | 채택 전 저장소 LICENSE 재확인 필요 |
| 그랜드 피아노 | [Salamander Grand Piano V3](https://github.com/sfzinstruments/SalamanderGrandPiano) (Alexander Holm) | **CC BY 3.0** | 저장소 확인 | **저작자(Alexander Holm) 표기 필수** | 앱 About/크레딧 화면에 표기. 파생 배포 시 원본 출처 명시 |
| 기타 다목적 타악/현 | [VCSL](https://github.com/sgossner/VCSL) | CC0-1.0 | 저장소 확인 | 없음 | 보충용 |

## 제외

| 음원 | 이유 |
|---|---|
| jRhodes3d (Rhodes 일렉피아노) | 샘플 배포는 **CC BY-NC 4.0**(비상업). 앱에 포함해 배포하면 NC 조건 위반 소지 → 공개 앱 제외. 일렉피아노는 대체 CC0 음원(예: Osiris Piano 등) 별도 조사 후 결정 |
| tonejs-instruments 번들 통째 사용 | README는 "샘플 CC-BY 3.0"이라 하나 출처가 VSO2/Karoryfer/Iowa/Freesound 혼합이고 개별 라이선스가 명시되지 않음. 번들 대신 **원 출처를 직접 사용** |
| Musicca 음원 | 저작권 보호. 사용 금지 |

## 미확인/후속 확인 항목
- VSCO 2 CE 원문 LICENSE 확인
- 일렉피아노 CC0 대체 음원 선정
- 각 음원 청취 후 최종 채택(음질/장르 적합도), mp3 변환 후 총 용량 산정(목표: 초기 로딩 20MB 이하 권장, 변환 결과로 재산정)
- 채택 음원은 `public/samples/`에 직접 호스팅하고, 앱 크레딧 화면에 Salamander 표기 포함

## 채택 기록
- 2026-09-28 **피아노 채택**: Salamander Grand Piano V3 (CC BY 3.0, Alexander Holm). Tone.js 문서가 안내하는 미러(`tonejs.github.io/audio/salamander/`)에서 mp3 30개를 받아 `public/samples/piano/`에 호스팅. 미러 폴더에는 LICENSE 파일이 없고 출처는 Tone.js 문서 기준(사용자 수락). 표기: `public/samples/piano/CREDITS.txt`, 앱 크레딧 화면(단계 7/8)에 반영 예정.
- 2026-09-28 **드럼 채택**: Virtuosity Drums (CC0 1.0, LICENSE 원문 확인). `Samples/mid` FLAC 42개(레인 9 × 세기 3 × 라운드로빈)를 mp3로 변환해 `public/samples/drums/`에 호스팅. 표기 의무 없음(CREDITS.txt에 출처만 기록).
- 2026-09-28 **베이스 채택**: Black and Blue Basses "darkblack" (Karoryfer, CC0 1.0, LICENSE 확인). regular mf rr1~rr4의 B1~G3 흰 건반 52개(13음×4)를 mp3로 변환해 `public/samples/bass/`에 호스팅. 표기 의무 없음.

### 채택 기록 — 스트링 (2026-09-28)
- FluidR3 GM `string_ensemble_1` (gleitz/midi-js-soundfonts 미러), **CC BY 3.0 — 크레딧 화면에 표기 필요**. 5종 비교 끝에 사용자가 앙상블 1 선택.
- 경로: `public/samples/strings/ensemble1/` (C/Eb/Gb/A × 옥타브 2~6, 20개, mp3 128k, 볼륨 +12dB 보정). 가운데 1.0~2.9초 루프.
- 탈락: Bigcat Cello(CC0), 앙상블 2, 신스, 트레몰로 (삭제).
