"""Rebuild with Blender --background --python scripts/art/build_characters.py."""
import bpy, math, json, os
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'assets/characters-original'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.38,emission=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 return m
M={k:mat(k,c,metal,rough,em) for k,c,metal,rough,em in [
 ('Porcelain',(.82,.91,.86),.05,.32,0),('Ink',(.024,.057,.083),.15,.3,0),('Lagoon',(.04,.58,.53),.25,.3,0),('Sunshine',(1,.56,.09),.1,.34,0),('Signal',(.31,.94,.9),.1,.25,1.2),('Clay',(.81,.31,.15),0,.6,0),('Moss',(.25,.43,.22),0,.65,0),('Cream',(.97,.79,.5),0,.6,0),('Bark',(.19,.10,.065),0,.6,0),('Orchid',(.49,.24,.77),.05,.37,0),('Pink',(.98,.37,.61),0,.4,0)]}
characters=[]; group=None
def empty(name,loc,parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc;o.parent=parent;return o
def finish(o,name,material,parent):
 o.name=name;o.data.materials.append(M[material]);o.parent=parent;return o
def cube(name,loc,scale,material,parent,bevel=.04):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0));o=bpy.context.object;o.location=loc;o.scale=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  b=o.modifiers.new('Soft molded edges','BEVEL');b.width=bevel;b.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=b.name)
 o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');return finish(o,name,material,parent)
def ball(name,loc,scale,material,parent,segments=16,rings=8):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1);o=bpy.context.object;o.location=loc;o.scale=scale
 for p in o.data.polygons:p.use_smooth=True
 return finish(o,name,material,parent)
def cone(name,loc,r1,r2,depth,material,parent,vertices=12):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth);o=bpy.context.object;o.location=loc;return finish(o,name,material,parent)
def limb(root,name,pivot,kind,material,size):
 p=empty(name,pivot,root);cube(name+'_mesh',(0,0,-size[2]/2),size,material,p,.025);return p
# PIP — solar-powered pocket surveyor.
r=empty('Pip_Root',(0,0,0));characters.append(r)
for s,x in [('L',-.115),('R',.115)]:
 p=limb(r,'Pip_Leg_'+s,(x,0,.29),'','Ink',(.105,.12,.23));cube('Pip_Boot_'+s,(0,-.035,-.24),(.16,.23,.10),'Lagoon',p,.03)
body=cube('Pip_Body',(0,0,.43),(.38,.25,.32),'Porcelain',r)
cube('Pip_ChestPanel',(0,-.137,.45),(.24,.025,.17),'Lagoon',r,.02)
for x in [-.065,0,.065]:cube('Pip_ChargeBar',(x,-.155,.455),(.035,.012,.07),'Sunshine',r,.006)
head=empty('Pip_Head',(0,0,.65),r);cube('Pip_Helmet',(0,0,.115),(.46,.32,.28),'Sunshine',head,.07);cube('Pip_Visor',(0,-.166,.11),(.365,.026,.16),'Ink',head,.045)
for x in [-.09,.09]:cube('Pip_Eye',(x,-.184,.12),(.052,.012,.07),'Signal',head,.02)
cone('Pip_Antenna',(0,.03,.32),.012,.009,.12,'Ink',head);ball('Pip_Beacon',(0,.03,.395),(.038,.038,.038),'Signal',head)
for s,x in [('L',-.255),('R',.255)]:
 p=limb(r,'Pip_Arm_'+s,(x,0,.56),'','Lagoon',(.10,.14,.23));ball('Pip_Hand_'+s,(0,0,-.255),(.065,.07,.065),'Sunshine',p)
cube('Pip_Backpack',(0,.18,.44),(.25,.14,.25),'Lagoon',r)
# FERN — woodland pathfinder, tiny fox-inspired cap and field satchel.
r=empty('Fern_Root',(0,0,0));characters.append(r)
for s,x in [('L',-.095),('R',.095)]:
 p=limb(r,'Fern_Leg_'+s,(x,0,.31),'','Moss',(.11,.12,.23));cube('Fern_Boot_'+s,(0,-.04,-.25),(.145,.22,.12),'Bark',p,.035)
cone('Fern_Coat',(0,0,.43),.215,.16,.32,'Moss',r)
cube('Fern_Scarf',(0,-.018,.60),(.34,.28,.07),'Sunshine',r,.025);cube('Fern_ScarfTail',(.105,-.177,.50),(.07,.035,.19),'Sunshine',r,.015)
h=empty('Fern_Head',(0,0,.65),r);ball('Fern_Face',(0,-.015,.10),(.20,.16,.18),'Cream',h)
ball('Fern_Cap',(0,.018,.19),(.225,.18,.13),'Clay',h);cube('Fern_CapBrim',(0,-.135,.18),(.43,.18,.045),'Clay',h,.025)
for x in [-.135,.135]:
 cone('Fern_CapEar',(x,0,.295),.073,.008,.16,'Clay',h,4)
 ball('Fern_Eye',(x*.55,-.165,.095),(.019,.014,.026),'Ink',h)
ball('Fern_Nose',(0,-.187,.06),(.029,.025,.022),'Clay',h)
for s,x in [('L',-.225),('R',.225)]:
 p=limb(r,'Fern_Arm_'+s,(x,0,.56),'','Moss',(.105,.13,.23));ball('Fern_Hand_'+s,(0,0,-.25),(.055,.06,.06),'Cream',p)
cube('Fern_FieldPack',(0,.19,.45),(.26,.14,.29),'Clay',r,.04);cube('Fern_Satchel',(-.185,-.10,.36),(.13,.12,.15),'Bark',r,.025)
# NOVA — curious velvet comet creature, ears and orbit backpack.
r=empty('Nova_Root',(0,0,0));characters.append(r)
for s,x in [('L',-.105),('R',.105)]:
 p=empty('Nova_Leg_'+s,(x,0,.19),r);ball('Nova_Foot_'+s,(0,-.05,-.11),(.10,.15,.08),'Orchid',p)
ball('Nova_Body',(0,0,.38),(.235,.18,.25),'Orchid',r);ball('Nova_Belly',(0,-.16,.365),(.14,.037,.15),'Pink',r)
h=empty('Nova_Head',(0,0,.62),r);ball('Nova_HeadMesh',(0,0,.09),(.28,.20,.22),'Orchid',h)
for s,x in [('L',-.18),('R',.18)]:
 ear=ball('Nova_Ear_'+s,(x,.018,.315),(.065,.065,.18),'Orchid',h);ear.rotation_euler[1]=(-.3 if x<0 else .3)
 ball('Nova_EarTip_'+s,(x*1.23,.018,.44),(.052,.052,.063),'Signal',h)
 ball('Nova_EyeWhite_'+s,(x*.58,-.179,.105),(.073,.031,.081),'Cream',h)
 ball('Nova_Pupil_'+s,(x*.58+.009,-.207,.10),(.032,.015,.044),'Ink',h)
 ball('Nova_EyeShine_'+s,(x*.58,-.222,.12),(.010,.008,.012),'Porcelain',h)
 p=empty('Nova_Arm_'+s,(x*1.5,0,.48),r);ball('Nova_ArmMesh_'+s,(0,0,-.07),(.065,.075,.14),'Orchid',p);ball('Nova_Paw_'+s,(0,-.02,-.175),(.073,.075,.065),'Signal',p)
ball('Nova_Mouth',(0,-.199,.018),(.038,.012,.018),'Ink',h)
for x in [-.052,0,.052]:ball('Nova_Freckle',(x,-.181,.225),(.013,.012,.013),'Pink',h)
cube('Nova_StarPack',(0,.185,.39),(.23,.12,.22),'Sunshine',r,.055)
# Normalize each character to one Blender unit high and put soles exactly on ground.
def descendants(root):return [root]+list(root.children_recursive)
for r in characters:
 bpy.context.view_layer.update(); meshes=[o for o in descendants(r) if o.type=='MESH']; coords=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box];lo=min(v.z for v in coords);hi=max(v.z for v in coords)
 r.scale=(1/(hi-lo),)*3;r.location.z=-lo/(hi-lo);bpy.context.view_layer.update()
 bpy.ops.object.select_all(action='DESELECT')
 for o in descendants(r):o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/(r.name.split('_')[0].lower()+'.glb')),use_selection=True,export_format='GLB',export_yup=True,export_apply=True)
# Studio scene; exported models above remain individually centered.
for r,x in zip(characters,[-1.05,0,1.05]):r.location.x=x
floor=mat('Studio',(.055,.082,.105),0,.75)
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.name='Studio_Floor';bpy.context.object.data.materials.append(floor)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.21,.28,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for name,pos,power,size in [('Key',(-3,-4,5),500,4),('Fill',(4,-2,3),350,3),('Rim',(1,3,4),600,3)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,.5))
bpy.ops.object.camera_add(location=(2.4,-7,3.0));cam=bpy.context.object;aim(cam,(0,0,.49));cam.data.type='ORTHO';cam.data.ortho_scale=3.75;scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=str(OUT/'contact-sheet.png')
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'original-characters.blend'));bpy.ops.render.render(write_still=True)
# Individual selection-card previews, with the same lighting and lens.
scene.render.resolution_x=640;scene.render.resolution_y=640;cam.data.ortho_scale=1.45
for active in characters:
 for r in characters:r.hide_render=(r!=active)
 x=active.location.x;cam.location=(x+1.4,-4,2);aim(cam,(x,0,.50))
 scene.render.filepath=str(OUT/(active.name.split('_')[0].lower()+'-preview.png'));bpy.ops.render.render(write_still=True)
# Independently reimport the delivery files and record their actual geometry.
report={}
for name in ['pip','fern','nova']:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(OUT/(name+'.glb')));bpy.context.view_layer.update()
 obs=list(bpy.context.scene.objects);meshes=[o for o in obs if o.type=='MESH'];coords=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
 report[name]={'bytes':(OUT/(name+'.glb')).stat().st_size,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'mesh_count':len(meshes),'material_count':len({m.name for o in meshes for m in o.data.materials}),'reimport_blender_bounds':[[round(min(v[i] for v in coords),5) for i in range(3)],[round(max(v[i] for v in coords),5) for i in range(3)]],'nodes':[o.name for o in obs]}
(OUT/'verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
